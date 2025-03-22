import TelegramBot from "node-telegram-bot-api";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { FilePositionStorage } from "../../models/PositionStore";
import { FileUserWalletMapStorage } from "../../models/UserWalletMap";
import { showPositionDetails, showUserPositions } from "../services/positionService";
import { showWalletManagement } from "../services/walletService";
import { sendMainMenu } from "../ui/menus";
import { showHelpMessage } from "../ui/menus";
import { handleUserQuery, sendQueryResults, sendPoolDetail, sendPairInfo } from "../queryPools";
import DLMM from "@meteora-ag/dlmm";
import { getWalletBalance } from "../utils/wallet";

// State management for callbacks
interface State {
  waitingForSearchTerm: Set<number>;
  waitingForAmount: Map<number, { tokenMint: string; sellTokenName: string; balance: number }>;
  waitingForCreatingPosition: Map<
    number,
    {
      positionKeyPair: Keypair;
      totalXAmount: any; // BN type
      totalYAmount: any; // BN type
      strategy: any; // StrategyParameters
      sellTokenMint: string;
      sellTokenSymbol: string;
      sellTokenAmount: any; // BN type
      buyTokenMint: string;
      buyTokenSymbol: string;
      expectedBuyAmount: string;
      entryPrice: number;
    }
  >;
  dlmmPool?: DLMM;
  pairInfo?: any; // PairInfo
  tokenXDecimal: number;
  tokenYDecimal: number;
}

// Initialize state
const state: State = {
  waitingForSearchTerm: new Set<number>(),
  waitingForAmount: new Map(),
  waitingForCreatingPosition: new Map(),
  tokenXDecimal: 0,
  tokenYDecimal: 0
};

/**
 * Initialize callback query handlers for the Telegram bot
 * @param bot Telegram bot instance
 * @param user User keypair
 * @param positionStorage Storage for positions
 * @param userWalletMapStorage Storage for user wallet mappings
 * @param connection Solana connection
 */
export const initCallbackHandlers = (
  bot: TelegramBot,
  user: Keypair,
  positionStorage: FilePositionStorage,
  userWalletMapStorage: FileUserWalletMapStorage,
  connection: Connection
): void => {
  // Listen for callback queries
  bot.on("callback_query", async (callbackQuery) => {
    try {
      const chatId = callbackQuery.message?.chat.id;
      if (!chatId) return;

      const data = callbackQuery.data;
      if (!data) return;
      
      // Handle main menu button
      if (data === "main_menu") {
        sendMainMenu(bot, chatId);
      }
      // Handle query pair button
      else if (data === "query_pair") {
        state.waitingForSearchTerm.add(chatId);
        bot.sendMessage(
          chatId,
          "Please enter the token pair you want to search (e.g., 'SOL/USDC')"
        );
      }
      // Handle view positions button
      else if (data === "view_positions") {
        await showUserPositions(bot, chatId, positionStorage, user.publicKey.toString());
      }
      // Handle show help button
      else if (data === "show_help") {
        showHelpMessage(bot, chatId);
        bot.answerCallbackQuery(callbackQuery.id);
      }
      // Handle position detail button
      else if (data.startsWith("position_")) {
        const positionId = data.replace("position_", "");
        await showPositionDetails(bot, chatId, positionStorage, positionId);
      }
      // Handle pagination
      else if (data.startsWith("page_")) {
        await sendQueryResults(bot, chatId);
      }
      // Handle pool detail button
      else if (data.startsWith("pool_detail_")) {
        const poolName = data.replace("pool_detail_", "");
        await sendPoolDetail(bot, chatId, poolName);
      }
      // Handle pair detail button
      else if (data.startsWith("pair_detail_")) {
        const pairAddress = data.replace("pair_detail_", "");
        state.dlmmPool = await DLMM.create(connection, new PublicKey(pairAddress), {
          cluster: "mainnet-beta",
        });
        bot.sendMessage(chatId, "🔍 Fetching pair info...");
        state.pairInfo = await sendPairInfo(bot, chatId, pairAddress);
        if (!state.pairInfo) {
          bot.sendMessage(chatId, "⚠️ Failed to fetch pair info!");
          return;
        }
        
        // We would need to add the rest of the implementation based on the original file
        // Including LP swap logic, position creation, etc.
      }
      // Handle LP swap operations
      else if (data.startsWith("lpswap_")) {
        // Extract token mint and token name from callback data
        // Format: lpswap_[tokenMint]_[tokenName]
        const parts = data.split('_');
        if (parts.length < 3) {
          bot.sendMessage(chatId, "⚠️ Invalid swap data format!");
          return;
        }
        
        const tokenMint = parts[1];
        const tokenName = parts[2];
        
        // Check if pairInfo is available (user should have selected a pair before)
        if (!state.pairInfo) {
          bot.sendMessage(chatId, "⚠️ Please select a trading pair first!");
          return;
        }
        
        // Get real user token balance
        const balance = await getWalletBalance({
          mintAddress: tokenMint,
          connection,
          publicKey: user.publicKey
        });
        
        // Store information in state for the next step (amount input)
        state.waitingForAmount.set(chatId, {
          tokenMint,
          sellTokenName: tokenName,
          balance
        });
        
        // Prompt user to enter amount
        bot.sendMessage(
          chatId,
          `💱 *Swap ${tokenName}*\n\nYour balance: ${balance} ${tokenName}\n\nPlease enter the amount you want to swap:`,
          { parse_mode: "Markdown" }
        );
        
        bot.answerCallbackQuery(callbackQuery.id);
      }
      // Wallet management related callbacks
      else if (data === "wallet_management") {
        await showWalletManagement(bot, chatId, userWalletMapStorage, user.publicKey.toString());
        bot.answerCallbackQuery(callbackQuery.id);
      }
      else if (data === "link_wallet") {
        // Link current wallet to user account
        await userWalletMapStorage.addWalletToChatId(
          chatId,
          user.publicKey.toString()
        );
        
        bot.answerCallbackQuery(callbackQuery.id, { 
          text: "Wallet linked successfully!" 
        });
        
        // Refresh wallet management page
        await showWalletManagement(bot, chatId, userWalletMapStorage, user.publicKey.toString());
      }
      else if (data === "set_primary_wallet") {
        const userMap = await userWalletMapStorage.getUserWalletMap(chatId);
        
        if (!userMap || userMap.walletAddresses.length <= 1) {
          bot.answerCallbackQuery(callbackQuery.id, { 
            text: "You need at least two linked wallets to set a primary one." 
          });
          return;
        }
        
        // Create selection keyboard
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
      else if (data === "remove_wallet") {
        const userMap = await userWalletMapStorage.getUserWalletMap(chatId);
        
        if (!userMap || userMap.walletAddresses.length === 0) {
          bot.answerCallbackQuery(callbackQuery.id, { 
            text: "You don't have any linked wallets to remove." 
          });
          return;
        }
        
        // Create selection keyboard
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
      // Set primary wallet callback
      else if (data.startsWith("set_primary_")) {
        const walletAddress = data.replace("set_primary_", "");
        
        await userWalletMapStorage.addWalletToChatId(
          chatId,
          walletAddress,
          true // Set as primary wallet
        );
        
        bot.answerCallbackQuery(callbackQuery.id, { 
          text: "Primary wallet updated successfully!" 
        });
        
        // Refresh wallet management page
        await showWalletManagement(bot, chatId, userWalletMapStorage, user.publicKey.toString());
      }
      // Remove wallet callback
      else if (data.startsWith("remove_wallet_")) {
        const walletAddress = data.replace("remove_wallet_", "");
        
        await userWalletMapStorage.removeWalletFromChatId(
          chatId,
          walletAddress
        );
        
        bot.answerCallbackQuery(callbackQuery.id, { 
          text: "Wallet removed successfully!" 
        });
        
        // Refresh wallet management page
        await showWalletManagement(bot, chatId, userWalletMapStorage, user.publicKey.toString());
      }
    } catch (error) {
      console.error("Error handling callback query:", error);
      bot.sendMessage(
        callbackQuery.message?.chat.id!,
        "⚠️ Something went wrong!"
      );
    }
  });
};

// Export state for use in other modules
export { state }; 