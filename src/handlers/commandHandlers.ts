import TelegramBot from "node-telegram-bot-api";
import { Connection, Keypair } from "@solana/web3.js";
import { FilePositionStorage } from "../../models/PositionStore";
import { FileUserWalletMapStorage } from "../../models/UserWalletMap";
import { positionMonitor } from "../utils/positionMonitor";
import { showPositionDetails, showUserPositions } from "../services/positionService";
import { showHelpMessage } from "../ui/menus";
import { showWalletManagement } from "../services/walletService";
import { sendMainMenu } from "../ui/menus";

/**
 * Initialize command handlers for the Telegram bot
 * @param bot Telegram bot instance
 * @param user User keypair
 * @param positionStorage Storage for positions
 * @param userWalletMapStorage Storage for user wallet mappings
 * @param connection Solana connection
 */
export const initCommandHandlers = (
  bot: TelegramBot,
  user: Keypair,
  positionStorage: FilePositionStorage,
  userWalletMapStorage: FileUserWalletMapStorage,
  connection: Connection
): void => {
  // Start command
  bot.onText(/\/start/, async (msg) => {
    bot.sendMessage(
      msg.chat.id,
      `🚀 Welcome to Meteora Bot, ${user.publicKey.toBase58()}!\n\n使用 /help 查看所有可用命令。`
    );
    sendMainMenu(bot, msg.chat.id);
  });

  // Help command
  bot.onText(/\/help/, async (msg) => {
    showHelpMessage(bot, msg.chat.id);
  });

  // Positions command
  bot.onText(/\/positions/, async (msg) => {
    if (!user) {
      bot.sendMessage(msg.chat.id, "⚠️ Please use /start to initialize the bot first.");
      return;
    }
    await showUserPositions(bot, msg.chat.id, positionStorage, user.publicKey.toString());
  });

  // Position detail command
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
    
    await showPositionDetails(bot, msg.chat.id, positionStorage, positionId);
  });

  // Wallet management command
  bot.onText(/\/wallets/, async (msg) => {
    const chatId = msg.chat.id;
    await showWalletManagement(bot, chatId, userWalletMapStorage, user.publicKey.toString());
  });

  // Start monitoring command
  bot.onText(/\/start_monitoring(.*)/, async (msg, match) => {
    const args = match?.[1]?.trim().split(/\s+/) || [];
    let interval = 10 * 1000; // Default 10 seconds
    
    if (args.length > 0 && args[0] !== '') {
      const seconds = parseInt(args[0]);
      if (!isNaN(seconds) && seconds > 0) {
        interval = seconds * 1000;
      }
    }
    
    positionMonitor.startMonitoring(interval);
    bot.sendMessage(msg.chat.id, `✅ Position monitoring started with interval of ${interval / 1000} seconds.`);
  });

  // Stop monitoring command
  bot.onText(/\/stop_monitoring/, async (msg) => {
    positionMonitor.stopMonitoring();
    bot.sendMessage(msg.chat.id, "⏹️ Position monitoring stopped.");
  });

  // Set monitoring interval command
  bot.onText(/\/set_interval (.+)/, async (msg, match) => {
    const seconds = parseInt(match?.[1] || "");
    if (!isNaN(seconds) && seconds > 0) {
      const interval = seconds * 1000;
      positionMonitor.updateMonitorInterval(interval);
      bot.sendMessage(msg.chat.id, `⏱️ Monitoring interval updated to ${seconds} seconds.`);
    } else {
      bot.sendMessage(msg.chat.id, "⚠️ Please provide a valid interval in seconds: /set_interval <seconds>");
    }
  });

  // Check positions now command
  bot.onText(/\/check_now/, async (msg) => {
    bot.sendMessage(msg.chat.id, "🔍 Checking all active positions now...");
    
    try {
      await positionMonitor.checkAllActivePositions();
      bot.sendMessage(msg.chat.id, "✅ Position check completed.");
    } catch (error) {
      bot.sendMessage(msg.chat.id, `⚠️ Error checking positions: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}; 