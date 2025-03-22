import TelegramBot from "node-telegram-bot-api";
import { Connection, PublicKey } from "@solana/web3.js";
import { FileUserWalletMapStorage } from "../../models/UserWalletMap";

/**
 * Shows wallet management interface to the user
 * @param bot Telegram bot instance
 * @param chatId Chat ID to send the wallet management UI
 * @param userWalletMapStorage Storage for user wallet mappings
 * @param currentWallet Current wallet public key string
 */
export const showWalletManagement = async (
  bot: TelegramBot,
  chatId: number,
  userWalletMapStorage: FileUserWalletMapStorage,
  currentWallet: string
): Promise<void> => {
  try {
    // Get the user's wallet mapping
    const userMap = await userWalletMapStorage.getUserWalletMap(chatId);
    
    let message = "💼 *Wallet Management*\n\n";
    
    if (!userMap || userMap.walletAddresses.length === 0) {
      message += "You don't have any wallets linked to your Telegram account yet.\n";
      message += "Your current active wallet is: `" + currentWallet + "`";
    } else {
      message += "Your linked wallets:\n\n";
      
      for (let i = 0; i < userMap.walletAddresses.length; i++) {
        const address = userMap.walletAddresses[i];
        const isPrimary = userMap.primaryWallet === address;
        
        message += `${i + 1}. \`${address}\`${isPrimary ? ' (Primary)' : ''}\n`;
      }
      
      if (!userMap.walletAddresses.includes(currentWallet)) {
        message += "\nYour current session wallet: `" + currentWallet + "` (Not linked)";
      }
    }
    
    // Create keyboard buttons
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