import { fetchMeteoraPools } from "./api/pool";
import TelegramBot from "node-telegram-bot-api";
import { QueryParams } from "./config";
import { fetchPairInfo } from "./api/DLMM";
import { formatNumber, getTokenName } from "./utils/format";
import BigNumber from "bignumber.js";

const userQueries: Record<number, QueryParams> = {};

// 发送查询结果
export const sendQueryResults = async (bot: TelegramBot, chatId: number) => {
  const query = userQueries[chatId];
  try {
    const pools = await fetchMeteoraPools(query);
    if (!pools || pools.length === 0) {
      return bot.sendMessage(chatId, "⚠️ No matching pools found!");
    }

    let message = `📌 *Query Results (Page ${query.page + 1}):*\n\n`;
    pools.forEach((pool) => {
      message += `🏷️ *Pool Name:* ${pool.name}\n`;
      message += `💰 *TVL:* $${pool.tvl}\n`;
      message += `📈 *Volume:* $${pool.volume}\n`;
      message += `⚖️ *Fee Ratio:* ${pool.feeRatio}\n\n`;
    });

    const buttons = pools.map((pool) => [
      {
        text: `${pool.name}`,
        callback_data: `pool_detail_${pool.name}`,
      },
    ]);

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

// 发送池子详情
export const sendPoolDetail = async (bot: TelegramBot, chatId: number, poolName: string) => {
  try {
    const pools = await fetchMeteoraPools(userQueries[chatId]);
    const pool = pools?.find((p) => p.name === poolName);
    if (!pool)
      return bot.sendMessage(chatId, "⚠️ No details found for this pool!");

    let message = `📌 *(Recommended Top 10) Pool Details: ${pool.name}*\n\n`;
    const pairs = pool.poolPairs.slice(0, 10);
    pairs.forEach((pair, index) => {
      message += `*Pair* ${index + 1}\n 🏷️ *BinStep:* ${pair.binStep}\n`;
      message += `💰 *TVL:* $${pair.tvl}\n`;
      message += `📈 *Volume:* $${pair.volume}\n`;
      message += `⚖️ *Fee Ratio:* ${pair.feeRatio}\n\n`;
    });

    const buttons: any[] = pairs.map((pair, index) => [
      {
        text: `Pair ${index + 1}`,
        callback_data: `pair_detail_${pair.address}`,
      },
    ]);

    buttons.push([{ text: "🔙 Back to Query Results", callback_data: "query_pair" }]);

    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons },
    });
  } catch (error) {
    bot.sendMessage(chatId, "⚠️ Failed to fetch data, please try again later!");
  }
};

// 处理用户查询请求
export const handleUserQuery = async (
  bot: TelegramBot,
  chatId: number,
  searchTerm: string
) => {
  bot.sendMessage(chatId, `🔍 Searching for: *${searchTerm}*...`, {
    parse_mode: "Markdown",
  });

  const query: QueryParams = {
    page: 0,
    limit: 5,
    search_term: searchTerm,
    sort_key: "tvl",
    order_by: "desc",
    hide_low_tvl: 600,
  };

  userQueries[chatId] = query;
  await sendQueryResults(bot, chatId);
};


export const sendPairInfo = async (bot: TelegramBot, chatId: number, pairHash: string) => {
    bot.sendMessage(chatId, '正在查询池子信息，请稍等...');
    const pairInfo = await fetchPairInfo(pairHash);
  if (!pairInfo) {
    bot.sendMessage(chatId, '❌ 未找到池信息，请检查输入的 pairHash 是否正确！');
    return;
  }
  const { tokenX, tokenY } = getTokenName(pairInfo);
  const responseMessage = `✅ **池子信息**
  🔹 **总锁仓量 (TVL)：** ${formatNumber(new BigNumber(pairInfo.liquidity))}
  🔹 **Token X:** ${tokenX}
  🔹 **Token Y:** ${tokenY}
  🔹 **24小时费用:** ${formatNumber(new BigNumber(pairInfo.fees_24h))}
  🔹 **Bin Step:** ${pairInfo.bin_step}
  `;

  bot.sendMessage(chatId, responseMessage, { parse_mode: 'Markdown' });
}