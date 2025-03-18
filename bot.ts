import TelegramBot from "node-telegram-bot-api";
import { BOT_TOKEN, PairInfo, RPC } from "./config";
import {
  handleUserQuery,
  sendQueryResults,
  sendPoolDetail,
  sendPairInfo,
} from "./queryPools";
import { fetchDecimal, getWallet, getWalletBalance } from "./utils/wallet";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import DLMM, { StrategyParameters, StrategyType } from "@meteora-ag/dlmm";
import {
  createOneSidePositions,
  getActiveBin,
  getBinsBetweenLowerAndUpperBound,
} from "./api/DLMM";
import { getTokenName } from "./utils/format";
import BN from "bn.js";
import { buildOptimalTransaction } from "./utils/tx";
import { FilePositionStorage } from "./models/PositionStore";
import { CreatePositionParams, TokenPair } from "./models/Position";
import taskScheduler, { LogLevel } from "./utils/scheduler";
import { positionMonitor } from "./utils/positionMonitor";
import { FileUserWalletMapStorage } from "./models/UserWalletMap";

// 记录用户查询状态
const waitingForSearchTerm = new Set<number>();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
let user: Keypair;
let dlmmPool: DLMM;
let pairInfo: PairInfo | undefined = undefined;
let tokenXDecimal = 0;
let tokenYDecimal = 0;
// 记录用户输入金额状态
const waitingForAmount = new Map<
  number,
  { tokenMint: string; sellTokenName: string; balance: number }
>();
// 记录创建仓位状态
const waitingForCreatingPosition = new Map<
  number,
  {
    positionKeyPair: Keypair;
    totalXAmount: BN;
    totalYAmount: BN;
    strategy: StrategyParameters;
    sellTokenMint: string;
    sellTokenSymbol: string;
    sellTokenAmount: BN;
    buyTokenMint: string;
    buyTokenSymbol: string;
    expectedBuyAmount: string;
    entryPrice: number;
  }
>();

// 仓位存储
const positionStorage = new FilePositionStorage();
const userWalletMapStorage = new FileUserWalletMapStorage();

// 记录用户
const connection = new Connection(RPC, "processed");

// 初始化并启动任务调度系统
const initializeScheduler = () => {
  // 启动仓位监控任务
  positionMonitor.telegramBot = bot;
  positionMonitor.startMonitoring();
  
  taskScheduler.log(LogLevel.INFO, "Task scheduler initialized");
};

// 发送主菜单
const sendMainMenu = (chatId: number) => {
  bot.sendMessage(chatId, "🔍 Please choose an action:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Make a New LP Swap", callback_data: "query_pair" }],
        [{ text: "View My Positions", callback_data: "view_positions" }],
        [{ text: "Manage Wallets", callback_data: "wallet_management" }],
        [{ text: "Help / Commands", callback_data: "show_help" }],
      ],
    },
  });
};

// 函数：显示用户仓位列表
const showUserPositions = async (chatId: number) => {
  try {
    // 首先尝试通过聊天ID获取仓位
    const positionsByChatId = await positionStorage.getPositionsByChatId(chatId);
    
    // 然后获取当前用户钱包的仓位
    const positionsByWallet = await positionStorage.getPositionsByUser(user.publicKey.toString());
    
    // 合并并去重结果
    const userPositions = [...positionsByChatId];
    
    // 添加未包含的钱包仓位
    for (const position of positionsByWallet) {
      if (!userPositions.some(p => p.id === position.id)) {
        userPositions.push(position);
      }
    }
    
    // 对于通过钱包找到但未关联chatId的仓位，自动更新关联
    for (const position of positionsByWallet) {
      if (position.chatId === undefined) {
        // 更新仓位以关联chatId
        await positionStorage.updatePosition(position.id, { chatId });
      }
    }
    
    // 同时确保钱包映射是最新的
    if (positionsByWallet.length > 0) {
      await userWalletMapStorage.addWalletToChatId(
        chatId,
        user.publicKey.toString()
      );
    }
    
    if (userPositions.length === 0) {
      bot.sendMessage(chatId, "You don't have any positions yet.");
      return;
    }

    // 构建消息内容
    let message = "🔍 *Your Positions*:\n\n";
    
    for (const position of userPositions) {
      const { tokenASymbol, tokenBSymbol } = position.tokenPair;
      const status = position.status;
      const createdAt = position.createdAt.toLocaleDateString();
      
      message += `*ID*: ${position.id}\n`;
      message += `*Pair*: ${tokenASymbol}/${tokenBSymbol}\n`;
      message += `*Status*: ${status}\n`;
      
      // 添加价格范围信息
      if (position.lowerPriceLimit && position.upperPriceLimit) {
        message += `*Price Range*: ${position.lowerPriceLimit.toFixed(4)} - ${position.upperPriceLimit.toFixed(4)} ${tokenBSymbol}/${tokenASymbol}\n`;
      }
      
      if (position.lastStatus?.currentPrice) {
        message += `*Current Price*: ${position.lastStatus.currentPrice.toFixed(4)} ${tokenBSymbol}/${tokenASymbol}\n`;
        message += `*In Range*: ${position.lastStatus.binInRange ? '✅ Yes' : '❌ No'}\n`;
      }
      
      if (position.sellTokenSymbol && position.buyTokenSymbol) {
        message += `*Trade*: ${position.sellTokenSymbol} ➡️ ${position.buyTokenSymbol}\n`;
      }
      
      message += `*Created*: ${createdAt}\n`;
      message += `[View Details](position_${position.id})\n\n`;
    }
    
    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Back to Main Menu", callback_data: "main_menu" }],
        ],
      },
    });
    
  } catch (error) {
    console.error("Error fetching positions:", error);
    bot.sendMessage(chatId, "⚠️ Failed to fetch your positions.");
  }
};

// 函数：显示单个仓位的详细信息
const showPositionDetails = async (chatId: number, positionId: string) => {
  try {
    const position = await positionStorage.getPosition(positionId);
    
    if (!position) {
      bot.sendMessage(chatId, "⚠️ Position not found.");
      return;
    }
    
    const history = await positionStorage.getPositionHistory(positionId);
    
    let message = "📊 *Position Details*\n\n";
    message += `*ID*: ${position.id}\n`;
    message += `*Pool*: ${position.tokenPair.tokenASymbol}/${position.tokenPair.tokenBSymbol}\n`;
    message += `*Status*: ${position.status}\n`;
    
    // 添加价格范围显示
    if (position.lowerPriceLimit && position.upperPriceLimit) {
      message += `*Price Range*: ${position.lowerPriceLimit.toFixed(4)} - ${position.upperPriceLimit.toFixed(4)} ${position.tokenPair.tokenBSymbol}/${position.tokenPair.tokenASymbol}\n`;
    }
    message += `*Bin Range*: ${position.lowerBinId} - ${position.upperBinId}\n\n`;
    
    // 显示当前价格和仓位状态信息
    if (position.lastStatus) {
      message += `*Current Price*: ${position.lastStatus.currentPrice.toFixed(4)} ${position.tokenPair.tokenBSymbol}/${position.tokenPair.tokenASymbol}\n`;
      message += `*In Range*: ${position.lastStatus.binInRange ? '✅ Yes' : '❌ No'}\n`;
      message += `*Active Bin*: ${position.lastStatus.activeBin}\n\n`;
    }
    
    if (position.sellTokenSymbol && position.buyTokenSymbol) {
      message += "*Trade Details*:\n";
      message += `*Sold*: ${position.sellTokenAmount ? position.sellTokenAmount.toString() : 'N/A'} ${position.sellTokenSymbol}\n`;
      message += `*Expected to Buy*: ${position.expectedBuyAmount || 'N/A'} ${position.buyTokenSymbol}\n`;
      message += `*Entry Price*: ${position.entryPrice || 'N/A'}\n\n`;
    }
    
    message += `*Created*: ${position.createdAt.toLocaleString()}\n`;
    
    if (position.closedAt) {
      message += `*Closed*: ${position.closedAt.toLocaleString()}\n\n`;
    }
    
    // 添加历史记录
    if (history.length > 0) {
      message += "*History*:\n";
      
      for (const event of history) {
        message += `• ${event.timestamp.toLocaleString()}: ${event.eventType}\n`;
      }
    }
    
    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Back to Positions", callback_data: "view_positions" }],
          [{ text: "Back to Main Menu", callback_data: "main_menu" }],
        ],
      },
    });
    
  } catch (error) {
    console.error("Error fetching position details:", error);
    bot.sendMessage(chatId, "⚠️ Failed to fetch position details.");
  }
};

// 监听按钮点击事件
bot.on("callback_query", async (callbackQuery) => {
  try {
    const chatId = callbackQuery.message?.chat.id;
    if (!chatId) return;

    const data = callbackQuery.data;
    if (!data) return;  // 如果data未定义，直接返回
    
    // query meteora pair
    if (data === "query_pair") {
      waitingForSearchTerm.add(chatId);
      bot.sendMessage(
        chatId,
        "Please enter the token pair you want to search (e.g., 'SOL/USDC')"
      );
    } else if (data === "view_positions") {
      // 显示用户仓位列表
      await showUserPositions(chatId);
    } else if (data === "show_help") {
      // 显示帮助信息
      showHelpMessage(chatId);
      bot.answerCallbackQuery(callbackQuery.id);
    } else if (data?.startsWith("position_")) {
      // 显示特定仓位详情
      const positionId = data.replace("position_", "");
      await showPositionDetails(chatId, positionId);
    } else if (data?.startsWith("page_")) {
      await sendQueryResults(bot, chatId);
    } else if (data?.startsWith("pool_detail_")) {
      const poolName = data.replace("pool_detail_", "");
      await sendPoolDetail(bot, chatId, poolName);
    } else if (data === "main_menu") {
      sendMainMenu(chatId);
    } else if (data?.startsWith("pair_detail_")) {
      // 查看交易池详情
      const pairAddress = data.replace("pair_detail_", "");
      dlmmPool = await DLMM.create(connection, new PublicKey(pairAddress), {
        cluster: "mainnet-beta",
      });
      bot.sendMessage(chatId, "🔍 Fetching pair info...");
      pairInfo = await sendPairInfo(bot, chatId, pairAddress);
      if (!pairInfo) {
        bot.sendMessage(chatId, "⚠️ Failed to fetch pair info!");
        return;
      }
      tokenXDecimal = await fetchDecimal(connection, pairInfo.mint_x);
      tokenYDecimal = await fetchDecimal(connection, pairInfo.mint_y);
    } else if (data?.startsWith("lpswap_")) {
      // lp swap逻辑
      bot.sendMessage(chatId, "🔍 Fetching wallet info...");
      const tokenMint = data.split("_")[1];
      const sellTokenName = data.split("_")[2];
      const balance = await getWalletBalance({
        connection,
        mintAddress: tokenMint,
        publicKey: user.publicKey,
      });
      bot.sendMessage(
        chatId,
        `💰 Your balance: ${balance.toFixed(2)} ${sellTokenName}
        Please input the token amount you want swap`
      );
      waitingForAmount.set(chatId, { tokenMint, sellTokenName, balance });
    } else if (data === "create_position") {
      // 创建仓位逻辑
      bot.sendMessage(chatId, "🔍 Creating position...");
      // 在这里添加创建仓位的代码
      const { 
        positionKeyPair, 
        totalXAmount, 
        totalYAmount, 
        strategy,
        sellTokenMint,
        sellTokenSymbol,
        sellTokenAmount,
        buyTokenMint,
        buyTokenSymbol,
        expectedBuyAmount,
        entryPrice
      } = waitingForCreatingPosition.get(chatId)!;
      
      const createTx = await createOneSidePositions(dlmmPool, {
        connection,
        user: user.publicKey,
        positionPubKey: positionKeyPair.publicKey,
        totalXAmount,
        totalYAmount,
        strategy,
      });
      // createTx.sign(positionKeyPair);
      // 获取最新区块哈希及其最后有效高度
      const res = await buildOptimalTransaction?.({
        transaction: createTx,
        connection,
        publicKey: user.publicKey,
      });
      const { opTx, blockhash, lastValidBlockHeight } = res!;
      if (!opTx) {
        bot.sendMessage(chatId, "⚠️ Failed to build optimal transaction!");
        return;
      }
      // 最终发送交易前加模拟逻辑
      const simulation = await connection.simulateTransaction(opTx, {
        sigVerify: false,
      });
      if (simulation.value.err) {
        bot.sendMessage(
          chatId,
          `⚠️ Transaction simulation error: ${simulation.value.err}`
        );
        return;
      }

      opTx.sign([user, positionKeyPair]);
      // 5. 发送交易
      const signature = await connection.sendTransaction(opTx, {
        skipPreflight: false, // 设为 true 以跳过预检
        maxRetries: 5, // 可选：增加重试次数
      });

      // 确认交易
      const confirmation = await connection.confirmTransaction(
        { blockhash, lastValidBlockHeight, signature },
        "confirmed"
      );
      
      if (confirmation && pairInfo) {
        // 创建仓位数据
        const { tokenX, tokenY } = getTokenName(pairInfo);
        const tokenPair: TokenPair = {
          tokenASymbol: tokenX,
          tokenBSymbol: tokenY,
          tokenAMint: pairInfo.mint_x,
          tokenBMint: pairInfo.mint_y,
          tokenADecimals: tokenXDecimal,
          tokenBDecimals: tokenYDecimal
        };
        
        const rangeBins = await getBinsBetweenLowerAndUpperBound({
          dlmmPool,
          actBin: await getActiveBin(dlmmPool),
          sellingX: tokenX === pairInfo.mint_x,
        });
        const rangeActBins = rangeBins.bins;
        
        const createParams: CreatePositionParams = {
          poolAddress: pairInfo.address,
          tokenPair: tokenPair,
          lowerBinId: strategy.minBinId,
          upperBinId: strategy.maxBinId,
          lowerPriceLimit: Number(rangeActBins[0].pricePerToken),
          upperPriceLimit: Number(rangeActBins[rangeActBins.length - 1].pricePerToken),
          initialLiquidityA: totalXAmount,
          initialLiquidityB: totalYAmount,
          userWallet: user.publicKey.toString(),
          chatId: chatId,
          sellTokenMint,
          sellTokenSymbol,
          sellTokenAmount: sellTokenAmount,
          buyTokenMint,
          buyTokenSymbol,
          expectedBuyAmount,
          entryPrice,
          notes: `Created via Telegram Bot - ${sellTokenSymbol} to ${buyTokenSymbol} swap`
        };
        
        // 创建并保存仓位
        const position = positionStorage.createPosition(createParams);
        await positionStorage.savePosition(position);
        
        // 更新用户钱包映射
        await userWalletMapStorage.addWalletToChatId(
          chatId,
          user.publicKey.toString(),
          true // 设置为主钱包
        );
        
        bot.sendMessage(
          chatId,
          `✅ Position created successfully!\nPosition ID: ${position.id}\nTransaction: ${signature}`
        );
      } else {
        bot.sendMessage(
          chatId,
          "✅ Transaction confirmed but position data could not be saved."
        );
      }
    }
    
    // 处理钱包管理相关回调
    if (data === "link_wallet") {
      // 链接当前钱包到用户账户
      await userWalletMapStorage.addWalletToChatId(
        chatId,
        user.publicKey.toString()
      );
      
      bot.answerCallbackQuery(callbackQuery.id, { 
        text: "Wallet linked successfully!" 
      });
      
      // 刷新钱包管理页面
      await showWalletManagement(chatId);
    }
    
    if (data === "set_primary_wallet") {
      const userMap = await userWalletMapStorage.getUserWalletMap(chatId);
      
      if (!userMap || userMap.walletAddresses.length <= 1) {
        bot.answerCallbackQuery(callbackQuery.id, { 
          text: "You need at least two linked wallets to set a primary one." 
        });
        return;
      }
      
      // 创建选择键盘
      const keyboard = userMap.walletAddresses.map((address, index) => {
        return [{ 
          text: `${index + 1}. ${address.slice(0, 8)}...${address.slice(-8)}`, 
          callback_data: `set_primary_${address}` 
        }];
      });
      
      keyboard.push([{ text: "Cancel", callback_data: "wallet_management" }]);
      
      bot.sendMessage(chatId, "Select a wallet to set as primary:", {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      
      bot.answerCallbackQuery(callbackQuery.id);
    }
    
    if (data === "remove_wallet") {
      const userMap = await userWalletMapStorage.getUserWalletMap(chatId);
      
      if (!userMap || userMap.walletAddresses.length === 0) {
        bot.answerCallbackQuery(callbackQuery.id, { 
          text: "You don't have any linked wallets to remove." 
        });
        return;
      }
      
      // 创建选择键盘
      const keyboard = userMap.walletAddresses.map((address, index) => {
        return [{ 
          text: `${index + 1}. ${address.slice(0, 8)}...${address.slice(-8)}`, 
          callback_data: `remove_wallet_${address}` 
        }];
      });
      
      keyboard.push([{ text: "Cancel", callback_data: "wallet_management" }]);
      
      bot.sendMessage(chatId, "Select a wallet to remove:", {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      
      bot.answerCallbackQuery(callbackQuery.id);
    }
    
    if (data === "wallet_management") {
      await showWalletManagement(chatId);
      bot.answerCallbackQuery(callbackQuery.id);
    }
    
    // 处理设置主钱包的回调
    if (data.startsWith("set_primary_")) {
      const walletAddress = data.replace("set_primary_", "");
      
      await userWalletMapStorage.addWalletToChatId(
        chatId,
        walletAddress,
        true // 设置为主钱包
      );
      
      bot.answerCallbackQuery(callbackQuery.id, { 
        text: "Primary wallet updated successfully!" 
      });
      
      // 刷新钱包管理页面
      await showWalletManagement(chatId);
    }
    
    // 处理移除钱包的回调
    if (data.startsWith("remove_wallet_")) {
      const walletAddress = data.replace("remove_wallet_", "");
      
      await userWalletMapStorage.removeWalletFromChatId(
        chatId,
        walletAddress
      );
      
      bot.answerCallbackQuery(callbackQuery.id, { 
        text: "Wallet removed successfully!" 
      });
      
      // 刷新钱包管理页面
      await showWalletManagement(chatId);
    }
  } catch (error) {
    console.error("Error handling callback query:", error);
    bot.sendMessage(
      callbackQuery.message?.chat.id!,
      "⚠️ Something went wrong!"
    );
  }
});

// 监听用户输入
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    if (msg.text?.startsWith("/positions")) {
      await showUserPositions(chatId);
    } else if (msg.text?.startsWith("/position")) {
      const args = msg.text.split(" ");
      if (args.length > 1) {
        const positionId = args[1];
        await showPositionDetails(chatId, positionId);
      } else {
        bot.sendMessage(chatId, "⚠️ Please provide a position ID: /position <ID>");
      }
    } else if (msg.text?.startsWith("/start_monitoring")) {
      // 启动监控任务
      const args = msg.text.split(" ");
      let interval = 10 * 1000; // 默认10秒
      
      if (args.length > 1) {
        const seconds = parseInt(args[1]);
        if (!isNaN(seconds) && seconds > 0) {
          interval = seconds * 1000;
        }
      }
      
      positionMonitor.startMonitoring(interval);
      bot.sendMessage(chatId, `✅ Position monitoring started with interval of ${interval / 1000} seconds.`);
    } else if (msg.text?.startsWith("/stop_monitoring")) {
      // 停止监控任务
      positionMonitor.stopMonitoring();
      bot.sendMessage(chatId, "⏹️ Position monitoring stopped.");
    } else if (msg.text?.startsWith("/set_interval")) {
      // 设置监控间隔
      const args = msg.text.split(" ");
      if (args.length > 1) {
        const seconds = parseInt(args[1]);
        if (!isNaN(seconds) && seconds > 0) {
          const interval = seconds * 1000;
          positionMonitor.updateMonitorInterval(interval);
          bot.sendMessage(chatId, `⏱️ Monitoring interval updated to ${seconds} seconds.`);
        } else {
          bot.sendMessage(chatId, "⚠️ Please provide a valid interval in seconds: /set_interval <seconds>");
        }
      } else {
        bot.sendMessage(chatId, "⚠️ Please provide an interval in seconds: /set_interval <seconds>");
      }
    } else if (msg.text?.startsWith("/check_now")) {
      // 立即检查所有仓位
      bot.sendMessage(chatId, "🔍 Checking all active positions now...");
      
      try {
        await positionMonitor.checkAllActivePositions();
        bot.sendMessage(chatId, "✅ Position check completed.");
      } catch (error) {
        bot.sendMessage(chatId, `⚠️ Error checking positions: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (waitingForSearchTerm.has(chatId) && msg.text) {
      waitingForSearchTerm.delete(chatId);
      const searchTerm = msg.text.trim();
      await handleUserQuery(bot, chatId, searchTerm);
    } else if (waitingForAmount.has(chatId) && msg.text) {
      // 处理输入金额，创建仓位逻辑
      const { tokenMint, sellTokenName, balance } =
        waitingForAmount.get(chatId)!;
      const amount = parseFloat(msg.text.trim());
      if (isNaN(amount) || amount < 0) {
        bot.sendMessage(
          chatId,
          "⚠️ Please enter a valid amount greater than or equal to 0."
        );
      } else if (amount > balance) {
        bot.sendMessage(
          chatId,
          `⚠️ The entered amount exceeds your balance of ${balance.toFixed(
            2
          )} ${sellTokenName}.`
        );
      } else {
        waitingForAmount.delete(chatId);
        // 处理用户输入的金额
        bot.sendMessage(
          chatId,
          `You entered: ${amount.toFixed(
            2
          )} ${sellTokenName}, fetching latest price...`
        );
        const activeBin = await getActiveBin(dlmmPool);
        const sellingX = tokenMint === pairInfo?.mint_x;
        const { tokenX, tokenY } = getTokenName(pairInfo!);
        const activePrice = sellingX
          ? Number(activeBin?.pricePerToken).toFixed(2)
          : (1 / Number(activeBin?.pricePerToken)).toFixed(2);
        const rangeBins = await getBinsBetweenLowerAndUpperBound({
          dlmmPool,
          actBin: activeBin,
          sellingX,
        });
        const rangeActBins = rangeBins.bins;
        // Calculate for display in message
        const maxOutPutDisplay = (
          amount * Number(rangeActBins[rangeActBins.length - 1].pricePerToken)
        ).toFixed(2);
        
        // Calculate integer value for BN (multiply by 10^decimals to remove decimal point)
        const buyTokenDecimals = sellingX ? tokenYDecimal : tokenXDecimal;
        const maxOutPutForBN = new BN(
          Math.floor(amount * Number(rangeActBins[rangeActBins.length - 1].pricePerToken) * 10 ** buyTokenDecimals)
        );
        
        const minBinId = rangeActBins[0].binId;
        const maxBinId = rangeActBins[rangeActBins.length - 1].binId;
        const rangeMsg = `📊 *Price Range*: ${Number(
          rangeActBins[0].pricePerToken
        ).toFixed(2)} - ${Number(
          rangeActBins[rangeActBins.length - 1].pricePerToken
        ).toFixed(2)}`;
        const msg = `📈 *Latest Price*: ${activePrice} ${
          sellingX ? tokenY : tokenX
        }/${sellingX ? tokenX : tokenY}\n💸 *Max Output*: ${maxOutPutDisplay} ${
          sellingX ? tokenY : tokenX
        }\n${rangeMsg}`;
        const positionKeyPair = new Keypair();
        const tokenXAmount = new BN(
          sellingX ? amount * 10 ** tokenXDecimal : 0
        );
        const tokenYAmount = new BN(
          sellingX ? 0 : amount * 10 ** tokenYDecimal
        );
        const strategy: StrategyParameters = {
          minBinId,
          maxBinId,
          strategyType: StrategyType.SpotImBalanced,
        };
        
        // 获取买入代币信息
        const buyTokenMint = sellingX ? pairInfo!.mint_y : pairInfo!.mint_x;
        const buyTokenSymbol = sellingX ? tokenY : tokenX;
        
        waitingForCreatingPosition.set(chatId, {
          positionKeyPair,
          totalXAmount: tokenXAmount,
          totalYAmount: tokenYAmount,
          strategy,
          sellTokenMint: tokenMint,
          sellTokenSymbol: sellTokenName,
          sellTokenAmount: sellingX ? tokenXAmount : tokenYAmount,
          buyTokenMint,
          buyTokenSymbol,
          expectedBuyAmount: maxOutPutForBN.toString(),
          entryPrice: Number(activePrice)
        });
        
        bot.sendMessage(chatId, msg, {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "Create Position", callback_data: "create_position" }],
            ],
          },
        });
      }
    }
  } catch (error) {
    console.error("Error handling message:", error);
    bot.sendMessage(msg.chat.id, "⚠️ Something went wrong!");
  }
});

// 启动 Bot
bot.onText(/\/start/, async (msg) => {
  const userWallet = await getWallet();
  user = userWallet;
  bot.sendMessage(
    msg.chat.id,
    `🚀 Welcome to Meteora Bot, ${user.publicKey.toBase58()}!\n\n使用 /help 查看所有可用命令。`
  );
  sendMainMenu(msg.chat.id);
});

// 查看仓位命令
bot.onText(/\/positions/, async (msg) => {
  if (!user) {
    bot.sendMessage(msg.chat.id, "⚠️ Please use /start to initialize the bot first.");
    return;
  }
  await showUserPositions(msg.chat.id);
});

// 查看单个仓位命令
bot.onText(/\/position (.+)/, async (msg, match) => {
  if (!user) {
    bot.sendMessage(msg.chat.id, "⚠️ Please use /start to initialize the bot first.");
    return;
  }
  
  const positionId = match?.[1];
  if (!positionId) {
    bot.sendMessage(msg.chat.id, "⚠️ Please provide a valid position ID: /position [ID]");
    return;
  }
  
  await showPositionDetails(msg.chat.id, positionId);
});

// 函数：钱包管理
const showWalletManagement = async (chatId: number) => {
  try {
    // 获取用户的钱包映射
    const userMap = await userWalletMapStorage.getUserWalletMap(chatId);
    
    let message = "💼 *Wallet Management*\n\n";
    
    if (!userMap || userMap.walletAddresses.length === 0) {
      message += "You don't have any wallets linked to your Telegram account yet.\n";
      message += "Your current active wallet is: `" + user.publicKey.toString() + "`";
    } else {
      message += "Your linked wallets:\n\n";
      
      for (let i = 0; i < userMap.walletAddresses.length; i++) {
        const address = userMap.walletAddresses[i];
        const isPrimary = userMap.primaryWallet === address;
        
        message += `${i + 1}. \`${address}\`${isPrimary ? ' (Primary)' : ''}\n`;
      }
      
      if (!userMap.walletAddresses.includes(user.publicKey.toString())) {
        message += "\nYour current session wallet: `" + user.publicKey.toString() + "` (Not linked)";
      }
    }
    
    // 创建键盘按钮
    const keyboard = [
      [{ text: "Link Current Wallet", callback_data: "link_wallet" }],
      [{ text: "Set Primary Wallet", callback_data: "set_primary_wallet" }],
      [{ text: "Remove Wallet", callback_data: "remove_wallet" }],
      [{ text: "Back to Main Menu", callback_data: "main_menu" }]
    ];
    
    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
  } catch (error) {
    console.error("Error in wallet management:", error);
    bot.sendMessage(chatId, "⚠️ Failed to manage wallet settings.");
  }
};

// 函数：显示帮助信息
const showHelpMessage = (chatId: number) => {
  const helpMessage = `
🤖 *MTR Trade Bot Help*

*Basic Commands:*
/start - 初始化机器人并显示主菜单
/help - 显示此帮助信息
/positions - 显示您的所有仓位
/position <ID> - 查看特定仓位详情
/wallets - 管理您的钱包地址

*监控命令:*
/start_monitoring [秒数] - 开始监控所有活跃仓位，默认每10秒检查一次
/stop_monitoring - 停止仓位监控
/set_interval <秒数> - 设置监控间隔时间，单位为秒
/check_now - 立即检查所有活跃仓位

*示例:*
\`/start_monitoring\` - 使用默认间隔10秒开始监控
\`/start_monitoring 30\` - 每30秒监控一次
\`/set_interval 5\` - 设置监控间隔为5秒
`;

  bot.sendMessage(chatId, helpMessage, {
    parse_mode: "Markdown",
    disable_web_page_preview: true
  });
};

// 在主程序执行入口处初始化定时任务
const initialize = async () => {
  try {
    // 初始化钱包配置
    user = await getWallet();
    
    // 初始化任务调度器
    initializeScheduler();
    
    // 添加钱包管理命令
    bot.onText(/\/wallets/, async (msg) => {
      const chatId = msg.chat.id;
      await showWalletManagement(chatId);
    });

    // 添加帮助命令
    bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      showHelpMessage(chatId);
    });
    
    console.log("Bot started successfully");
  } catch (error) {
    console.error("Error starting bot:", error instanceof Error ? error.message : String(error));
  }
};

// 启动机器人
initialize();
