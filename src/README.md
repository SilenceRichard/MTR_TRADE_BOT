# MTR Trade Bot Source Code

This directory contains the modular version of the MTR trade bot.

## Directory Structure

```
src/
├── bot.ts                # Main entry point (smaller)
├── handlers/             # Command and message handlers
│   ├── commandHandlers.ts  # Bot command handlers
│   ├── callbackHandlers.ts # Callback query handlers
│   ├── messageHandlers.ts  # Message handlers
├── services/             # Business logic
│   ├── positionService.ts  # Position-related functionality
│   ├── walletService.ts    # Wallet management
│   ├── queryService.ts     # Pool queries and searches
├── ui/                   # User interface components
│   ├── menus.ts            # Menu generation
│   ├── messages.ts         # Message formatting
└── types/                # Type definitions
    └── index.ts            # Shared types
```

## Setup Instructions

To complete the modular setup:

1. **Copy Handler Files**: Copy the handler files from the project directory:
   ```bash
   cp -r Projects/MTR_TRADE_BOT/src/handlers/* Projects/MTR_TRADE_BOT/src/handlers/
   cp -r Projects/MTR_TRADE_BOT/src/services/* Projects/MTR_TRADE_BOT/src/services/
   cp -r Projects/MTR_TRADE_BOT/src/ui/* Projects/MTR_TRADE_BOT/src/ui/
   cp -r Projects/MTR_TRADE_BOT/src/types/* Projects/MTR_TRADE_BOT/src/types/
   ```

2. **Update bot.ts**: Once the files are copied, uncomment the handler imports in bot.ts:
   ```typescript
   import { initCommandHandlers } from "./handlers/commandHandlers";
   import { initCallbackHandlers } from "./handlers/callbackHandlers";
   import { initMessageHandlers } from "./handlers/messageHandlers";
   import { sendMainMenu } from "./ui/menus";
   
   // In the initialize function:
   initCommandHandlers(bot, user, positionStorage, userWalletMapStorage, connection);
   initCallbackHandlers(bot, user, positionStorage, userWalletMapStorage, connection);
   initMessageHandlers(bot, user, positionStorage, userWalletMapStorage, connection);
   ```

3. **Compile the Code**: Run TypeScript compiler to check for errors:
   ```bash
   npx tsc
   ```

4. **Run the Bot**: Start the bot using the new entry point:
   ```bash
   node dist/src/bot.js
   ``` 