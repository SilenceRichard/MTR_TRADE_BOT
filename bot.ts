import TelegramBot from "node-telegram-bot-api";
import { BOT_TOKEN, QueryParams } from "./config";
import { fetchMeteoraPools } from "./api";

// Record user query states
const userQueries: Record<number, QueryParams> = {};
const waitingForSearchTerm = new Set<number>();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Send main menu
const sendMainMenu = (chatId: number) => {
  bot.sendMessage(chatId, "🔍 Please choose an action:", {
    reply_markup: {
      inline_keyboard: [[{ text: "Make a LP Swap", callback_data: "query" }]],
    },
  });
};

// Listen for button clicks
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message?.chat.id!;
  const action = callbackQuery.data;

  if (action === "query") {
    waitingForSearchTerm.add(chatId);
    bot.sendMessage(chatId, "Please enter the token pair to query, e.g., `SOL` or `USDC`:", {
      parse_mode: "Markdown",
    });
  } else if (action?.startsWith("page_")) {
    if (!userQueries[chatId]) return;

    if (action === "page_next") {
      userQueries[chatId].page += 1;
    } else if (userQueries[chatId].page > 0) {
      userQueries[chatId].page -= 1;
    }

    await sendQueryResults(chatId);
  } else if (action?.startsWith("pool_detail_")) {
    const poolName = action.replace("pool_detail_", "");
    await sendPoolDetail(chatId, poolName);
  } else if (action === "main_menu") {
    sendMainMenu(chatId);
  }
});

// Listen for user input search keywords
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  if (waitingForSearchTerm.has(chatId)) {
    waitingForSearchTerm.delete(chatId);

    const searchTerm = msg.text!.trim();
    bot.sendMessage(chatId, `🔍 Searching for: *${searchTerm}*...`, {
      parse_mode: "Markdown",
    });

    const query: QueryParams = {
      page: 0,
      limit: 10,
      search_term: searchTerm,
      sort_key: "tvl",
      order_by: "desc",
      hide_low_tvl: 600,
    };

    userQueries[chatId] = query;
    await sendQueryResults(chatId);
  }
});

// Send query results (with buttons)
const sendQueryResults = async (chatId: number) => {
  const query = userQueries[chatId];
  try {
    const pools = await fetchMeteoraPools(query);
    if (!pools || pools.length === 0) {
      return bot.sendMessage(chatId, "⚠️ No matching pools found!");
    }

    let message = `📌 *Query Results (Page ${query.page + 1})*:\n\n`;
    const buttons = pools.map((pool) => {
      return [
        {
          text: `${pool.name}\n💰 TVL: $${pool.tvl} Volume: $${pool.volume} Fee Ratio: ${pool.feeRatio}`,
          callback_data: `pool_detail_${pool.name}`,
        },
      ];
    });

    buttons.push([
      { text: "⬅️ Previous Page", callback_data: "page_prev" },
      { text: "Next Page ➡️", callback_data: "page_next" },
    ]);
    buttons.push([{ text: "🔙 Back to Main Menu", callback_data: "main_menu" }]);

    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (error) {
    bot.sendMessage(chatId, "⚠️ Failed to fetch data, please try again later!");
  }
};

// Send pool details
const sendPoolDetail = async (chatId: number, poolName: string) => {
  try {
    const pools = await fetchMeteoraPools(userQueries[chatId]);
    const pool = pools?.find((p) => p.name === poolName);
    if (!pool) return bot.sendMessage(chatId, "⚠️ No details found for this pool!");
    let message = `📌 *Pool Details: ${pool.name}*\n\n`;
    message += `🔹 **Token Pair**: ${pool.name}\n`;
    message += `💰 **TVL**: $${pool.tvl}\n`;
    message += `📈 **24h Volume**: $${pool.volume}\n`;
    message += `⚖️ **Fee Ratio**: ${pool.feeRatio}\n`;
    const buttons = pool.poolPairs.map((pair) => {
      return [
        {
          text: `BinStep: ${pair.binStep}, TVL: $${pair.tvl} Volume: $${pair.volume} Fee Ratio: ${pair.feeRatio}`,
          callback_data: `pair_detail_${pair.name}`,
        },
      ];
    });

    buttons.push([{ text: "🔙 Back to Query Results", callback_data: "query" }]);

    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (error) {
    bot.sendMessage(chatId, "⚠️ Failed to fetch data, please try again later!");
  }
};

// Start Bot
bot.onText(/\/start/, (msg) => {
  sendMainMenu(msg.chat.id);
});

console.log("🚀 Meteora Bot is running...");
