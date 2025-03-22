import TelegramBot from "node-telegram-bot-api";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { FilePositionStorage } from "../../models/PositionStore";
import { FileUserWalletMapStorage } from "../../models/UserWalletMap";
import { handleUserQuery } from "../queryPools";
import { positionMonitor } from "../utils/positionMonitor";
import { state } from "./callbackHandlers";
import { showPositionDetails, showUserPositions } from "../services/positionService";
import { getTokenName } from "../utils/format";
import BN from "bn.js";
import { sendAndConfirmTransaction } from "@solana/web3.js";

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
            
            // Execute the swap
            const swapTx = await state.dlmmPool.swap({
              inToken,
              binArraysPubkey: swapQuote.binArraysPubkey,
              inAmount: amountBN,
              lbPair: state.dlmmPool.pubkey,
              user: user.publicKey,
              minOutAmount: swapQuote.minOutAmount,
              outToken,
            });
            
            // Send and confirm the transaction
            const swapTxHash = await sendAndConfirmTransaction(
              connection, 
              swapTx, 
              [user],
              { skipPreflight: false, preflightCommitment: "processed" }
            );
            
            // Update message with success information
            await bot.editMessageText(
              `✅ *Swap Successful*\n\n` +
              `You swapped *${amount} ${amountInfo.sellTokenName}*\n` +
              `You received approximately *${estimatedReceiveAmount.toFixed(6)} ${buyTokenName}*\n\n` +
              `Transaction hash: \`${swapTxHash}\``,
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