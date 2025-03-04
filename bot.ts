import TelegramBot from "node-telegram-bot-api";
import { BOT_TOKEN, PairInfo, RPC } from "./config";
import {
  handleUserQuery,
  sendQueryResults,
  sendPoolDetail,
  sendPairInfo,
} from "./queryPools";
import { getWallet, getWalletBalance } from "./utils/wallet";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import DLMM from "@meteora-ag/dlmm";

// 记录用户查询状态
const waitingForSearchTerm = new Set<number>();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
let user: Keypair;
let dlmmPool: DLMM;
let pairInfo: PairInfo | undefined = undefined;
// 记录用户输入金额状态
const waitingForAmount = new Map<number, { tokenMint: string; sellTokenName: string; balance: number }>();
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
      bot.sendMessage(chatId, `💰 Your balance: ${balance} ${sellTokenName}
        Please input the token amount you want swap`);
      waitingForAmount.set(chatId, { tokenMint, sellTokenName, balance });
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
  const chatId = msg.chat.id;
  if (waitingForSearchTerm.has(chatId)) {
    waitingForSearchTerm.delete(chatId);
    const searchTerm = msg.text!.trim();
    await handleUserQuery(bot, chatId, searchTerm);
  } else if (waitingForAmount.has(chatId)) {
    const { tokenMint, sellTokenName, balance } = waitingForAmount.get(chatId)!;
    const amount = parseFloat(msg.text!.trim());
    if (isNaN(amount) || amount < 0) {
      bot.sendMessage(chatId, "⚠️ Please enter a valid amount greater than or equal to 0.");
    } else if (amount > balance) {
      bot.sendMessage(chatId, `⚠️ The entered amount exceeds your balance of ${balance} ${sellTokenName}.`);
    } else {
      waitingForAmount.delete(chatId);
      // 处理用户输入的金额
      bot.sendMessage(chatId, `You entered: ${amount} ${sellTokenName}`);
      // 在这里添加处理交换逻辑的代码
    }
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
