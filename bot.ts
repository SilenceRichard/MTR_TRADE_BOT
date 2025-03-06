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
  }
>();

// 记录用户
const connection = new Connection(RPC, "processed");
// 发送主菜单
const sendMainMenu = (chatId: number) => {
  bot.sendMessage(chatId, "🔍 Please choose an action:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Make a New LP Swap", callback_data: "query_pair" }],
      ],
    },
  });
};

// 监听按钮点击事件
bot.on("callback_query", async (callbackQuery) => {
  try {
    const chatId = callbackQuery.message?.chat.id!;
    const action = callbackQuery.data;
    // query meteora pair
    if (action === "query_pair") {
      waitingForSearchTerm.add(chatId);
      bot.sendMessage(
        chatId,
        "Please enter the token pair to query, e.g., `SOL` or `USDC`:",
        {
          parse_mode: "Markdown",
        }
      );
    } else if (action?.startsWith("page_")) {
      await sendQueryResults(bot, chatId);
    } else if (action?.startsWith("pool_detail_")) {
      const poolName = action.replace("pool_detail_", "");
      await sendPoolDetail(bot, chatId, poolName);
    } else if (action === "main_menu") {
      sendMainMenu(chatId);
    } else if (action?.startsWith("pair_detail_")) {
      // 查看交易池详情
      const pairAddress = action.replace("pair_detail_", "");
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
    } else if (action?.startsWith("lpswap_")) {
      // lp swap逻辑
      bot.sendMessage(chatId, "🔍 Fetching wallet info...");
      const tokenMint = action.split("_")[1];
      const sellTokenName = action.split("_")[2];
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
    } else if (action === "create_position") {
      // 创建仓位逻辑
      bot.sendMessage(chatId, "🔍 Creating position...");
      // 在这里添加创建仓位的代码
      const { positionKeyPair, totalXAmount, totalYAmount, strategy } =
        waitingForCreatingPosition.get(chatId)!;
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
      bot.sendMessage(
        chatId,
        "✅ Position created successfully! " + confirmation
      );
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
    if (waitingForSearchTerm.has(chatId)) {
      waitingForSearchTerm.delete(chatId);
      const searchTerm = msg.text!.trim();
      await handleUserQuery(bot, chatId, searchTerm);
    } else if (waitingForAmount.has(chatId)) {
      // 处理输入金额，创建仓位逻辑
      const { tokenMint, sellTokenName, balance } =
        waitingForAmount.get(chatId)!;
      const amount = parseFloat(msg.text!.trim());
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
        const maxOutPut = (
          amount * Number(rangeActBins[rangeActBins.length - 1].pricePerToken)
        ).toFixed(2);
        const minBinId = rangeActBins[0].binId;
        const maxBinId = rangeActBins[rangeActBins.length - 1].binId;
        const rangeMsg = `📊 *Price Range*: ${Number(
          rangeActBins[0].pricePerToken
        ).toFixed(2)} - ${Number(
          rangeActBins[rangeActBins.length - 1].pricePerToken
        ).toFixed(2)}`;
        const msg = `📈 *Latest Price*: ${activePrice} ${
          sellingX ? tokenY : tokenX
        }/${sellingX ? tokenX : tokenY}\n💸 *Max Output*: ${maxOutPut} ${
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
        waitingForCreatingPosition.set(chatId, {
          positionKeyPair,
          totalXAmount: tokenXAmount,
          totalYAmount: tokenYAmount,
          strategy,
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
    `🚀 Welcome to Meteora Bot, ${user.publicKey.toBase58()}!`
  );
  sendMainMenu(msg.chat.id);
});

console.log("🚀 Meteora Bot is running...");
