import TelegramBot from "node-telegram-bot-api";
import { BOT_TOKEN, RPC } from "./config";
import { Connection, Keypair } from "@solana/web3.js";
import { getWallet } from "./utils/wallet";
import taskScheduler, { LogLevel } from "./utils/scheduler";
import { positionMonitor } from "./utils/positionMonitor";
import { FilePositionStorage } from "../models/PositionStore";
import { FileUserWalletMapStorage } from "../models/UserWalletMap";
import { initCommandHandlers } from "./handlers/commandHandlers";
import { initCallbackHandlers } from "./handlers/callbackHandlers";
import { initMessageHandlers } from "./handlers/messageHandlers";
import { sendMainMenu } from "./ui/menus";

// Initialize bot with polling
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Shared state
let user: Keypair;
const connection = new Connection(RPC, "processed");

// Storage instances
const positionStorage = new FilePositionStorage();
const userWalletMapStorage = new FileUserWalletMapStorage();

// Initialize and start the task scheduler
const initializeScheduler = () => {
  // Start position monitoring task
  positionMonitor.telegramBot = bot;
  positionMonitor.startMonitoring();
  
  taskScheduler.log(LogLevel.INFO, "Task scheduler initialized");
};

// Main initialization function
const initialize = async () => {
  try {
    // Initialize wallet configuration
    user = await getWallet();
    
    // Initialize handlers
    initCommandHandlers(bot, user, positionStorage, userWalletMapStorage, connection);
    initCallbackHandlers(bot, user, positionStorage, userWalletMapStorage, connection);
    initMessageHandlers(bot, user, positionStorage, userWalletMapStorage, connection);
    
    // Initialize task scheduler
    initializeScheduler();
    
    console.log("Bot started successfully");
  } catch (error) {
    console.error("Error starting bot:", error instanceof Error ? error.message : String(error));
  }
};

// Start the bot
initialize();

export {
  bot,
  user,
  connection,
  positionStorage,
  userWalletMapStorage
}; 