import TelegramBot from "node-telegram-bot-api";

/**
 * Sends the main menu to the user
 * @param bot Telegram bot instance
 * @param chatId Chat ID to send the menu to
 */
export const sendMainMenu = (bot: TelegramBot, chatId: number): void => {
  bot.sendMessage(chatId, "🔍 Please choose an action:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Make a New LP Swap", callback_data: "query_pair" }],
        [{ text: "View My Positions", callback_data: "view_positions" }],
        [{ text: "Manage Wallets", callback_data: "wallet_management" }],
        [{ text: "Help / Commands", callback_data: "show_help" }],
      ],
    },
  });
};

/**
 * Displays help message to the user
 * @param bot Telegram bot instance
 * @param chatId Chat ID to send the help message to
 */
export const showHelpMessage = (bot: TelegramBot, chatId: number): void => {
  const helpMessage = `
🤖 *MTR Trade Bot Help*

*Basic Commands:*
/start - 初始化机器人并显示主菜单
/help - 显示此帮助信息
/positions - 显示您的所有仓位
/position <ID> - 查看特定仓位详情
/wallets - 管理您的钱包地址

*监控命令:*
/start_monitoring [秒数] - 开始监控所有活跃仓位，默认每10秒检查一次
/stop_monitoring - 停止仓位监控
/set_interval <秒数> - 设置监控间隔时间，单位为秒
/check_now - 立即检查所有活跃仓位

*示例:*
\`/start_monitoring\` - 使用默认间隔10秒开始监控
\`/start_monitoring 30\` - 每30秒监控一次
\`/set_interval 5\` - 设置监控间隔为5秒
`;

  bot.sendMessage(chatId, helpMessage, {
    parse_mode: "Markdown",
    disable_web_page_preview: true
  });
}; 