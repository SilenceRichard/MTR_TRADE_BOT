import TelegramBot from "node-telegram-bot-api";
import { FilePositionStorage } from "../../models/PositionStore";

/**
 * Display a list of all positions for a user
 * @param bot Telegram bot instance
 * @param chatId Chat ID to send the positions list to
 * @param positionStorage Storage for positions
 * @param userPublicKey Public key of the user's wallet
 * @param userWalletMapStorage Optional storage for user wallet mappings
 */
export const showUserPositions = async (
  bot: TelegramBot,
  chatId: number,
  positionStorage: FilePositionStorage,
  userPublicKey: string
): Promise<void> => {
  try {
    // First try to get positions by chat ID
    const positionsByChatId = await positionStorage.getPositionsByChatId(chatId);
    
    // Then get positions by wallet address
    const positionsByWallet = await positionStorage.getPositionsByUser(userPublicKey);
    
    // Merge and deduplicate results
    const userPositions = [...positionsByChatId];
    
    // Add wallet positions that aren't already included
    for (const position of positionsByWallet) {
      if (!userPositions.some(p => p.id === position.id)) {
        userPositions.push(position);
      }
    }
    
    // For positions found by wallet but not associated with chatId, automatically update the association
    for (const position of positionsByWallet) {
      if (position.chatId === undefined) {
        // Update position to associate with chatId
        await positionStorage.updatePosition(position.id, { chatId });
      }
    }
    
    if (userPositions.length === 0) {
      bot.sendMessage(chatId, "You don't have any positions yet.");
      return;
    }

    // Build message content
    let message = "🔍 *Your Positions*:\n\n";
    
    for (const position of userPositions) {
      const { tokenASymbol, tokenBSymbol } = position.tokenPair;
      const status = position.status;
      const createdAt = position.createdAt.toLocaleDateString();
      
      message += `*ID*: ${position.id}\n`;
      message += `*Pair*: ${tokenASymbol}/${tokenBSymbol}\n`;
      message += `*Status*: ${status}\n`;
      
      // Add price range information
      if (position.lowerPriceLimit && position.upperPriceLimit) {
        message += `*Price Range*: ${position.lowerPriceLimit.toFixed(4)} - ${position.upperPriceLimit.toFixed(4)} ${tokenBSymbol}/${tokenASymbol}\n`;
      }
      
      if (position.lastStatus?.currentPrice) {
        message += `*Current Price*: ${position.lastStatus.currentPrice.toFixed(4)} ${tokenBSymbol}/${tokenASymbol}\n`;
        message += `*In Range*: ${position.lastStatus.binInRange ? '✅ Yes' : '❌ No'}\n`;
      }
      
      if (position.sellTokenSymbol && position.buyTokenSymbol) {
        message += `*Trade*: ${position.sellTokenSymbol} ➡️ ${position.buyTokenSymbol}\n`;
      }
      
      message += `*Created*: ${createdAt}\n`;
      message += `[View Details](position_${position.id})\n\n`;
    }
    
    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Back to Main Menu", callback_data: "main_menu" }],
        ],
      },
    });
    
  } catch (error) {
    console.error("Error fetching positions:", error);
    bot.sendMessage(chatId, "⚠️ Failed to fetch your positions.");
  }
};

/**
 * Display details of a specific position
 * @param bot Telegram bot instance
 * @param chatId Chat ID to send the position details to
 * @param positionStorage Storage for positions
 * @param positionId ID of the position to display
 */
export const showPositionDetails = async (
  bot: TelegramBot,
  chatId: number,
  positionStorage: FilePositionStorage,
  positionId: string
): Promise<void> => {
  try {
    const position = await positionStorage.getPosition(positionId);
    
    if (!position) {
      bot.sendMessage(chatId, "⚠️ Position not found.");
      return;
    }
    
    const history = await positionStorage.getPositionHistory(positionId);
    
    let message = "📊 *Position Details*\n\n";
    message += `*ID*: ${position.id}\n`;
    message += `*Pool*: ${position.tokenPair.tokenASymbol}/${position.tokenPair.tokenBSymbol}\n`;
    message += `*Status*: ${position.status}\n`;
    
    // Add price range display
    if (position.lowerPriceLimit && position.upperPriceLimit) {
      message += `*Price Range*: ${position.lowerPriceLimit.toFixed(4)} - ${position.upperPriceLimit.toFixed(4)} ${position.tokenPair.tokenBSymbol}/${position.tokenPair.tokenASymbol}\n`;
    }
    message += `*Bin Range*: ${position.lowerBinId} - ${position.upperBinId}\n\n`;
    
    // Show current price and position status
    if (position.lastStatus) {
      message += `*Current Price*: ${position.lastStatus.currentPrice.toFixed(4)} ${position.tokenPair.tokenBSymbol}/${position.tokenPair.tokenASymbol}\n`;
      message += `*In Range*: ${position.lastStatus.binInRange ? '✅ Yes' : '❌ No'}\n`;
      message += `*Active Bin*: ${position.lastStatus.activeBin}\n\n`;
    }
    
    if (position.sellTokenSymbol && position.buyTokenSymbol) {
      message += "*Trade Details*:\n";
      message += `*Sold*: ${position.sellTokenAmount ? position.sellTokenAmount.toString() : 'N/A'} ${position.sellTokenSymbol}\n`;
      message += `*Expected to Buy*: ${position.expectedBuyAmount || 'N/A'} ${position.buyTokenSymbol}\n`;
      message += `*Entry Price*: ${position.entryPrice || 'N/A'}\n\n`;
    }
    
    message += `*Created*: ${position.createdAt.toLocaleString()}\n`;
    
    if (position.closedAt) {
      message += `*Closed*: ${position.closedAt.toLocaleString()}\n\n`;
    }
    
    // Add history records
    if (history.length > 0) {
      message += "*History*:\n";
      
      for (const event of history) {
        message += `• ${event.timestamp.toLocaleString()}: ${event.eventType}\n`;
      }
    }
    
    bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Back to Positions", callback_data: "view_positions" }],
          [{ text: "Back to Main Menu", callback_data: "main_menu" }],
        ],
      },
    });
    
  } catch (error) {
    console.error("Error fetching position details:", error);
    bot.sendMessage(chatId, "⚠️ Failed to fetch position details.");
  }
}; 