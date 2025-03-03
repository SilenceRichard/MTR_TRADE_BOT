import TelegramBot from "node-telegram-bot-api";
import { BOT_TOKEN, RPC } from "./config";
import { handleUserQuery, sendQueryResults, sendPoolDetail } from "./queryPools";
import { getWallet } from "./wallet";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import DLMM from "@meteora-ag/dlmm";

// 记录用户查询状态
const waitingForSearchTerm = new Set<number>();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
let user: Keypair;
let dlmmPool: DLMM;
const connection = new Connection(RPC, "processed");
// 发送主菜单
const sendMainMenu = (chatId: number) => {
  bot.sendMessage(chatId, "🔍 Please choose an action:", {
    reply_markup: {
      inline_keyboard: [[{ text: "Make a New LP Swap", callback_data: "query_pair" }]],
    },
  });
};

// 监听按钮点击事件
bot.on("callback_query", async (callbackQuery) => {
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
    const pairAddress = action.replace("pair_detail_", "");
    bot.sendMessage(chatId, `Connecting Pair: ${pairAddress}`);
    dlmmPool = await DLMM.create(connection, new PublicKey(pairAddress), {
      cluster: "mainnet-beta",
    });
    bot.sendMessage(chatId, `Connect DLMM Pool Success!`);
  }
});

// 监听用户输入
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (waitingForSearchTerm.has(chatId)) {
    waitingForSearchTerm.delete(chatId);
    const searchTerm = msg.text!.trim();
    await handleUserQuery(bot, chatId, searchTerm);
  }
});

// 启动 Bot
bot.onText(/\/start/, async (msg) => {
  const user = await getWallet();
  bot.sendMessage(msg.chat.id, `🚀 Welcome to Meteora Bot, ${user.publicKey.toBase58()}!`);
  sendMainMenu(msg.chat.id);
});

console.log("🚀 Meteora Bot is running...");
