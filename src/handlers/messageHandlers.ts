import TelegramBot from "node-telegram-bot-api";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { FilePositionStorage } from "../../models/PositionStore";
import { FileUserWalletMapStorage } from "../../models/UserWalletMap";
import { handleUserQuery } from "../queryPools";
import { positionMonitor } from "../utils/positionMonitor";
import { state } from "./callbackHandlers";
import { showPositionDetails, showUserPositions } from "../services/positionService";
import { getTokenName } from "../utils/format";
import BN from "bn.js";
import { sendAndConfirmTransaction } from "@solana/web3.js";
import { CreatePositionParams } from '../../models/Position';
import { createOneSidePositions, getActiveBin } from '../api/DLMM';
import { StrategyType } from "@meteora-ag/dlmm";

/**
 * Helper function to calculate maximum bin ID based on active bin and token direction
 * @param activeBin The current active bin
 * @param fromToken The token direction ("x" or "y")
 * @returns The maximum bin ID for the strategy
 */
const getMaxBinId = (activeBin: number, fromToken: string): number => {
  if (typeof activeBin !== 'number' || !fromToken) {
    return 0;
  }
  // Fixed step value of 10 as requested
  const stepValue = 10;
  const maxBinId = fromToken === "x" ? activeBin + stepValue : activeBin;
  return maxBinId;
};

/**
 * Helper function to calculate minimum bin ID based on active bin and token direction
 * @param activeBin The current active bin
 * @param fromToken The token direction ("x" or "y")
 * @returns The minimum bin ID for the strategy
 */
const getMinBinId = (activeBin: number, fromToken: string): number => {
  if (typeof activeBin !== 'number' || !fromToken) {
    return 0;
  }
  // Fixed step value of 10 as requested
  const stepValue = 10;
  const minBinId = fromToken === "x" ? activeBin : activeBin - stepValue;
  return minBinId;
};

/**
 * Initialize message handlers for the Telegram bot
 * @param bot Telegram bot instance
 * @param user User keypair
 * @param positionStorage Storage for positions
 * @param userWalletMapStorage Storage for user wallet mappings
 * @param connection Solana connection
 */
export const initMessageHandlers = (
  bot: TelegramBot,
  user: Keypair,
  positionStorage: FilePositionStorage,
  userWalletMapStorage: FileUserWalletMapStorage,
  connection: Connection
): void => {
  // Listen for message events
  bot.on("message", async (msg) => {
    try {
      const chatId = msg.chat.id;
      
      // Skip command messages as they're handled by command handlers
      if (msg.text?.startsWith("/")) {
        return;
      }
      
      // Handle search term input
      if (state.waitingForSearchTerm.has(chatId) && msg.text) {
        state.waitingForSearchTerm.delete(chatId);
        const searchTerm = msg.text.trim();
        await handleUserQuery(bot, chatId, searchTerm);
      }
      // Handle amount input for swap operations
      else if (state.waitingForAmount.has(chatId) && msg.text) {
        const amountInfo = state.waitingForAmount.get(chatId);
        if (!amountInfo) return;
        
        const inputText = msg.text.trim();
        let amount: number;
        
        try {
          // 确保使用标准格式解析数字
          amount = Number(inputText.replace(/,/g, '.'));
          
          // 验证是否为有效数字
          if (isNaN(amount) || amount <= 0) {
            throw new Error("Invalid amount");
          }
          
          // Check if amount exceeds balance
          if (amount > amountInfo.balance) {
            bot.sendMessage(chatId, `⚠️ Insufficient balance! You only have ${amountInfo.balance} ${amountInfo.sellTokenName} available.`);
            return;
          }
          
          // Get the buy token name from the state.pairInfo
          const { tokenX, tokenY } = getTokenName(state.pairInfo);
          
          // 确定买入和卖出的代币
          const buyTokenName = amountInfo.sellTokenName === tokenX ? tokenY : tokenX;
          
          // 使用交易对的当前价格计算预估收到的金额
          let exchangeRate = state.pairInfo?.current_price || 1;
          let estimatedReceiveAmount: number;
          
          // 根据卖出的代币是X还是Y调整汇率计算
          if (amountInfo.sellTokenName === tokenX) {
            // 如果卖出X购买Y，使用当前价格
            estimatedReceiveAmount = amount * exchangeRate;
          } else {
            // 如果卖出Y购买X，使用当前价格的倒数
            estimatedReceiveAmount = amount / exchangeRate;
          }
          
          // Send initial message to user indicating processing of swap
          const processingMessage = await bot.sendMessage(
            chatId,
            `⏳ *Processing Swap*\n\n` +
            `Swapping *${amount} ${amountInfo.sellTokenName}* for approximately *${estimatedReceiveAmount.toFixed(6)} ${buyTokenName}*...`,
            { parse_mode: "Markdown" }
          );
          
          try {
            // Convert amount to lamports (or smallest unit for the token)
            // Note: This is a simplified conversion. In a real implementation, 
            // you would need to consider the decimals of each specific token
            const decimals = 9; // Assuming 9 decimals for simplicity - adjust based on actual token decimals
            const amountBN = new BN(amount * Math.pow(10, decimals));
            
            // Check if we have a valid DLMM pool instance
            if (!state.dlmmPool) {
              throw new Error("DLMM pool not initialized");
            }
            
            // Determine if we're swapping X to Y or Y to X
            const swapXtoY = amountInfo.sellTokenName === tokenX;
            
            // Get bin arrays for swap
            const binArrays = await state.dlmmPool.getBinArrayForSwap(swapXtoY);
            
            // Get swap quote
            const slippageTolerance = new BN(10); // 0.1% slippage tolerance
            const swapQuote = await state.dlmmPool.swapQuote(
              amountBN,
              swapXtoY,
              slippageTolerance,
              binArrays
            );
            
            // Determine input and output token public keys
            const inToken = swapXtoY 
              ? new PublicKey(state.pairInfo.mint_x)
              : new PublicKey(state.pairInfo.mint_y);
            
            const outToken = swapXtoY 
              ? new PublicKey(state.pairInfo.mint_y)
              : new PublicKey(state.pairInfo.mint_x);
              
            // 创建一个新的位置密钥对，用于创建仓位
            const positionKeyPair = Keypair.generate();
            
            // 获取当前活跃bin以计算合适的仓位范围
            const activeBin = await getActiveBin(state.dlmmPool!);
            const currentPrice = parseFloat(activeBin.pricePerToken.toString());
            const actBin = activeBin.binId;
            
            // 确定fromToken，用于计算bin范围
            const fromToken = swapXtoY ? "x" : "y";
            
            // 使用更新的策略结构
            const strategy = {
              strategyType: StrategyType.SpotImBalanced,
              minBinId: getMinBinId(actBin, fromToken),
              maxBinId: getMaxBinId(actBin, fromToken),
            };
            
            // 根据卖出的代币类型计算初始流动性
            const totalXAmount = swapXtoY ? amountBN : new BN(0);
            const totalYAmount = swapXtoY ? new BN(0) : amountBN;
            
            // 设置仓位创建所需的所有参数
            state.waitingForCreatingPosition.set(chatId, {
              positionKeyPair,
              totalXAmount,
              totalYAmount,
              strategy,
              sellTokenMint: inToken.toString(),
              sellTokenSymbol: amountInfo.sellTokenName,
              sellTokenAmount: amountBN,
              buyTokenMint: outToken.toString(),
              buyTokenSymbol: buyTokenName,
              expectedBuyAmount: estimatedReceiveAmount.toString(),
              entryPrice: exchangeRate
            });
            
            // 请求用户确认创建仓位
            await bot.editMessageText(
              `✅ *Create Position Confirmation*\n\n` +
              `You are about to create a position with:\n` +
              `- *${amount} ${amountInfo.sellTokenName}*\n` +
              `- Current price: ${currentPrice.toFixed(4)}\n` +
              `- Bin range: ${strategy.minBinId} - ${strategy.maxBinId}\n\n` +
              `Please confirm by replying with "yes" or "confirm" or cancel with "no" or "cancel".`,
              {
                chat_id: chatId,
                message_id: processingMessage.message_id,
                parse_mode: "Markdown"
              }
            );
            
          } catch (error: any) {
            console.error("Swap execution error:", error);
            
            // Update message with error information
            await bot.editMessageText(
              `❌ *Swap Failed*\n\n` +
              `There was an error executing your swap of *${amount} ${amountInfo.sellTokenName}*.\n\n` +
              `Error: ${error.message || "Unknown error"}`,
              {
                chat_id: chatId,
                message_id: processingMessage.message_id,
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🔙 Back to Main Menu", callback_data: "main_menu" }]
                  ]
                }
              }
            );
          }
          
        } catch (error) {
          bot.sendMessage(
            chatId,
            "⚠️ Please enter a valid number for the amount to swap."
          );
          return;
        } finally {
          // Clean up state
          state.waitingForAmount.delete(chatId);
        }
      }
      
      // 检查用户是否正在确认创建仓位
      if (state.waitingForCreatingPosition.has(chatId) && msg.text) {
        const callbackState = state.waitingForCreatingPosition.get(chatId);
        
        if (callbackState?.positionKeyPair && callbackState.strategy) {
          // 用户确认创建仓位
          if (msg.text.toLowerCase() === "yes" || msg.text.toLowerCase() === "confirm" || msg.text === "确认") {
            try {
              // 创建并保存仓位的逻辑，从这里开始可能需要根据您的实际代码进行调整
              bot.sendMessage(chatId, "⏳ Creating your position...");
              
              // 获取代币对信息
              let tokenXStr: string;
              let tokenYStr: string;
              
              if (typeof state.pairInfo.mint_x === 'string') {
                // 如果是字符串，尝试获取代币名称
                const tokenInfo = getTokenName(state.pairInfo);
                tokenXStr = tokenInfo.tokenX || 'TokenX';
                tokenYStr = tokenInfo.tokenY || 'TokenY';
              } else {
                // 默认值
                tokenXStr = 'TokenX';
                tokenYStr = 'TokenY';
              }
              
              // 使用已保存在state中的策略参数和流动性数据
              // 这样确保用户确认的是什么，我们就执行什么
              const strategy = callbackState.strategy;
              const totalXAmount = callbackState.totalXAmount;
              const totalYAmount = callbackState.totalYAmount;
              
              const processingMsg = await bot.sendMessage(
                chatId,
                "🔄 Executing on-chain transaction to create your position...",
                { parse_mode: "Markdown" }
              );
              
              // 创建仓位交易
              const txResult = await createOneSidePositions(state.dlmmPool!, {
                connection,
                positionPubKey: callbackState.positionKeyPair.publicKey,
                user: user.publicKey,
                totalXAmount,
                totalYAmount,
                strategy
              });
              
              // 签名并发送交易
              txResult.opTx.sign([user, callbackState.positionKeyPair]);
              
              // 发送交易到链上
              const txId = await connection.sendTransaction(txResult.opTx, {
                maxRetries: 3,
                skipPreflight: false
              });
              
              // 等待交易确认
              await connection.confirmTransaction({
                signature: txId,
                blockhash: txResult.blockhash,
                lastValidBlockHeight: txResult.lastValidBlockHeight
              });
              
              // 更新处理消息，告知用户交易已确认
              await bot.editMessageText(
                `✅ Transaction confirmed!\nTransaction ID: \`${txId}\`\n\nNow saving position details...`,
                {
                  chat_id: chatId,
                  message_id: processingMsg.message_id,
                  parse_mode: "Markdown"
                }
              );
              
              // 计算价格范围，仅用于记录
              const activeBin = await getActiveBin(state.dlmmPool!);
              const currentPrice = parseFloat(activeBin.pricePerToken.toString());
              const pricePadding = 0.05; // 5%的价格缓冲区
              const lowerPrice = currentPrice * (1 - pricePadding);
              const upperPrice = currentPrice * (1 + pricePadding);
              
              // 创建新仓位参数
              const createParams: CreatePositionParams = {
                poolAddress: state.pairInfo.address,
                tokenPair: {
                  tokenASymbol: tokenXStr,
                  tokenBSymbol: tokenYStr,
                  tokenAMint: state.pairInfo.mint_x,
                  tokenBMint: state.pairInfo.mint_y,
                  tokenADecimals: state.tokenXDecimal,
                  tokenBDecimals: state.tokenYDecimal
                },
                lowerBinId: strategy.minBinId,
                upperBinId: strategy.maxBinId,
                lowerPriceLimit: lowerPrice,
                upperPriceLimit: upperPrice,
                initialLiquidityA: totalXAmount.toString(),
                initialLiquidityB: totalYAmount.toString(),
                userWallet: user.publicKey.toString(),
                chatId: chatId,
                sellTokenMint: callbackState.sellTokenMint,
                sellTokenSymbol: callbackState.sellTokenSymbol,
                sellTokenAmount: callbackState.sellTokenAmount.toString(),
                buyTokenMint: callbackState.buyTokenMint,
                buyTokenSymbol: callbackState.buyTokenSymbol,
                expectedBuyAmount: callbackState.expectedBuyAmount,
                entryPrice: callbackState.entryPrice
              };
              
              // 记录额外信息到日志，这些不需要存储在仓位参数中
              console.log('Additional position data:', {
                positionAddress: callbackState.positionKeyPair.publicKey.toString(),
                transactionId: txId
              });
              
              // 创建仓位记录
              const position = positionStorage.createPosition(createParams);
              console.log(`Created new position with ID: ${position.id} and address ${callbackState.positionKeyPair.publicKey.toString()}`);
              
              // 立即检查新仓位状态，确保发送通知
              await positionMonitor.checkNewPosition(position.id);
              
              // 清理状态
              state.waitingForCreatingPosition.delete(chatId);
              
              // 通知用户仓位创建成功
              bot.sendMessage(
                chatId,
                `✅ *Position created successfully!*\n\n` +
                `Your position ID: \`${position.id}\`\n` +
                `Position Address: \`${callbackState.positionKeyPair.publicKey.toString()}\`\n` +
                `Transaction ID: \`${txId}\`\n\n` +
                `Range: ${strategy.minBinId} - ${strategy.maxBinId}\n` +
                `You will receive status notifications when changes occur.`,
                {
                  parse_mode: "Markdown",
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "View Position Details", callback_data: `position_${position.id}` }],
                      [{ text: "🔙 Back to Main Menu", callback_data: "main_menu" }]
                    ]
                  }
                }
              );
            } catch (error) {
              console.error("Error creating position:", error);
              
              // Improve error message for specific error codes
              let errorMessage = error instanceof Error ? error.message : String(error);
              
              // Check for Solana custom error code 6040 (often indicates insufficient funds)
              if (errorMessage.includes('"Custom":6040')) {
                errorMessage = "创建仓位失败 - 可能是流动性设置不合理。正在尝试使用更宽的价格范围...";
                
                // 通知用户我们正在尝试调整参数
                const retryMsg = await bot.sendMessage(
                  chatId,
                  "⏳ 第一次尝试失败，正在使用更宽的价格范围重试...",
                  { parse_mode: "Markdown" }
                );
                
                try {
                  // 获取原始仓位参数
                  const originalState = state.waitingForCreatingPosition.get(chatId);
                  
                  if (originalState && originalState.strategy) {
                    // 使用更宽的价格范围和bin范围
                    const wideBinPadding = 20; // 使用更宽的bin范围
                    
                    // 复制原始策略并调整
                    const adjustedStrategy = {...originalState.strategy};
                    
                    // 检查是否有minBinId和maxBinId
                    if (typeof adjustedStrategy.minBinId === 'number' && typeof adjustedStrategy.maxBinId === 'number') {
                      const originalLower = adjustedStrategy.minBinId;
                      const originalUpper = adjustedStrategy.maxBinId;
                      const binRange = originalUpper - originalLower;
                      
                      // 扩大bin范围
                      adjustedStrategy.minBinId = originalLower - Math.floor(wideBinPadding / 2);
                      adjustedStrategy.maxBinId = originalUpper + Math.floor(wideBinPadding / 2);
                      
                      console.log(`尝试扩大bin范围: 原始[${originalLower}-${originalUpper}], 新范围[${adjustedStrategy.minBinId}-${adjustedStrategy.maxBinId}]`);
                      
                      // 更新状态
                      state.waitingForCreatingPosition.set(chatId, {
                        ...originalState,
                        strategy: adjustedStrategy
                      });
                      
                      // 更新消息
                      await bot.editMessageText(
                        "🔄 正在尝试使用更宽的价格范围创建仓位...",
                        {
                          chat_id: chatId,
                          message_id: retryMsg.message_id,
                          parse_mode: "Markdown"
                        }
                      );
                      
                      // 重新创建仓位交易
                      const txResult = await createOneSidePositions(state.dlmmPool!, {
                        connection,
                        positionPubKey: originalState.positionKeyPair.publicKey,
                        user: user.publicKey,
                        totalXAmount: originalState.totalXAmount,
                        totalYAmount: originalState.totalYAmount,
                        strategy: adjustedStrategy
                      });
                      
                      // 签名并发送交易
                      txResult.opTx.sign([user, originalState.positionKeyPair]);
                      
                      // 发送交易到链上
                      const txId = await connection.sendTransaction(txResult.opTx, {
                        maxRetries: 3,
                        skipPreflight: false
                      });
                      
                      // 等待交易确认
                      await connection.confirmTransaction({
                        signature: txId,
                        blockhash: txResult.blockhash,
                        lastValidBlockHeight: txResult.lastValidBlockHeight
                      });
                      
                      // 更新消息，告知用户交易已确认
                      await bot.editMessageText(
                        "✅ 重试成功！交易已确认，正在保存仓位...",
                        {
                          chat_id: chatId,
                          message_id: retryMsg.message_id,
                          parse_mode: "Markdown"
                        }
                      );
                      
                      // 获取代币对信息
                      let tokenXStr: string;
                      let tokenYStr: string;
                      
                      if (typeof state.pairInfo.mint_x === 'string') {
                        // 如果是字符串，尝试获取代币名称
                        const tokenInfo = getTokenName(state.pairInfo);
                        tokenXStr = tokenInfo.tokenX || 'TokenX';
                        tokenYStr = tokenInfo.tokenY || 'TokenY';
                      } else {
                        // 默认值
                        tokenXStr = 'TokenX';
                        tokenYStr = 'TokenY';
                      }
                      
                      // 计算价格范围，仅用于记录
                      const activeBin = await getActiveBin(state.dlmmPool!);
                      const currentPrice = parseFloat(activeBin.pricePerToken.toString());
                      const pricePadding = 0.05; // 5%的价格缓冲区
                      const lowerPrice = currentPrice * (1 - pricePadding);
                      const upperPrice = currentPrice * (1 + pricePadding);
                      
                      // 创建新仓位参数 - 使用与之前相同的逻辑
                      const createParams: CreatePositionParams = {
                        poolAddress: state.pairInfo.address,
                        tokenPair: {
                          tokenASymbol: tokenXStr,
                          tokenBSymbol: tokenYStr,
                          tokenAMint: state.pairInfo.mint_x,
                          tokenBMint: state.pairInfo.mint_y,
                          tokenADecimals: state.tokenXDecimal,
                          tokenBDecimals: state.tokenYDecimal
                        },
                        lowerBinId: adjustedStrategy.minBinId,
                        upperBinId: adjustedStrategy.maxBinId,
                        lowerPriceLimit: lowerPrice,
                        upperPriceLimit: upperPrice,
                        initialLiquidityA: originalState.totalXAmount.toString(),
                        initialLiquidityB: originalState.totalYAmount.toString(),
                        userWallet: user.publicKey.toString(),
                        chatId: chatId,
                        sellTokenMint: originalState.sellTokenMint,
                        sellTokenSymbol: originalState.sellTokenSymbol,
                        sellTokenAmount: originalState.sellTokenAmount.toString(),
                        buyTokenMint: originalState.buyTokenMint,
                        buyTokenSymbol: originalState.buyTokenSymbol,
                        expectedBuyAmount: originalState.expectedBuyAmount,
                        entryPrice: originalState.entryPrice
                      };
                      
                      // 创建仓位记录
                      const position = positionStorage.createPosition(createParams);
                      console.log(`Created new position with ID: ${position.id} and address ${originalState.positionKeyPair.publicKey.toString()}`);
                      
                      // 立即检查新仓位状态，确保发送通知
                      await positionMonitor.checkNewPosition(position.id);
                      
                      // 清理状态
                      state.waitingForCreatingPosition.delete(chatId);
                      
                      // 通知用户仓位创建成功
                      bot.sendMessage(
                        chatId,
                        `✅ *Position created successfully after retry!*\n\n` +
                        `Your position ID: \`${position.id}\`\n` +
                        `Position Address: \`${originalState.positionKeyPair.publicKey.toString()}\`\n` +
                        `Transaction ID: \`${txId}\`\n\n` +
                        `Range: ${adjustedStrategy.minBinId} - ${adjustedStrategy.maxBinId} (wider range)\n` +
                        `You will receive status notifications when changes occur.`,
                        {
                          parse_mode: "Markdown",
                          reply_markup: {
                            inline_keyboard: [
                              [{ text: "View Position Details", callback_data: `position_${position.id}` }],
                              [{ text: "🔙 Back to Main Menu", callback_data: "main_menu" }]
                            ]
                          }
                        }
                      );
                      
                      // 成功重试后直接返回，不显示错误
                      return;
                    }
                  }
                } catch (retryError) {
                  console.error("Error during retry:", retryError);
                  // 重试失败，继续显示原始错误
                  errorMessage = "创建仓位失败 - 尝试调整范围后仍然失败。请稍后重试或使用较小的金额。";
                }
              }
              
              bot.sendMessage(
                chatId,
                `❌ Failed to create position: ${errorMessage}`,
                {
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "🔙 Back to Main Menu", callback_data: "main_menu" }]
                    ]
                  }
                }
              );
            }
          } else if (msg.text.toLowerCase() === "no" || msg.text.toLowerCase() === "cancel" || msg.text === "取消") {
            // 用户取消创建仓位
            state.waitingForCreatingPosition.delete(chatId);
            bot.sendMessage(
              chatId,
              "❌ Position creation cancelled.",
              {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🔙 Back to Main Menu", callback_data: "main_menu" }]
                  ]
                }
              }
            );
          }
        }
      }
      
    } catch (error) {
      console.error("Error handling message:", error);
      bot.sendMessage(msg.chat.id, "⚠️ Something went wrong!");
    }
  });
};

/**
 * Handler for messages from a position monitoring service
 * Used for notifications about position status changes
 * @param bot Telegram bot instance
 * @param chatId Chat ID to send the notification to
 * @param message Message text
 * @param options Additional message options
 */
export const sendPositionNotification = (
  bot: TelegramBot,
  chatId: number,
  message: string,
  options?: TelegramBot.SendMessageOptions
): void => {
  try {
    bot.sendMessage(chatId, message, options);
  } catch (error) {
    console.error("Error sending position notification:", error);
  }
}; 