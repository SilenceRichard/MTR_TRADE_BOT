# MTR Trade Bot - Code Structure

This document outlines the structure of the MTR Trade Bot codebase, providing a map of the key directories and files and their responsibilities.

## Directory Structure

```
MTR_TRADE_BOT/
├── .git/               # Git repository data
├── .github/            # GitHub configurations
├── memory-bank/        # Documentation for AI context
├── src/                # Source code
│   ├── models/         # Data models and storage implementations
│   ├── api/            # External API integrations
│   ├── handlers/       # Request handlers and controllers
│   ├── services/       # Business logic services
│   ├── utils/          # Utility functions and helpers
│   ├── ui/             # UI components and templates
│   ├── types/          # TypeScript type definitions
│   ├── data/           # Local data storage
│   ├── config.ts       # Application configuration
│   ├── bot.ts          # Bot initialization
│   └── README.md       # Source code documentation
├── tests/              # Test suite
│   ├── e2e/            # End-to-end tests
│   ├── integration/    # Integration tests
│   ├── utils/          # Test utilities
│   └── mocks/          # Mock implementations for testing
├── node_modules/       # Node.js dependencies
├── data/               # Data files used in development/testing
├── coverage/           # Test coverage reports
├── README.md           # Project overview
├── TODO.md             # Pending tasks and features
├── code_structure.md   # This file
├── project-brief.md    # Project description and requirements
├── package.json        # Project dependencies and scripts
├── package-lock.json   # Dependency lock file
├── tsconfig.json       # TypeScript configuration
└── jest.config.js      # Jest test framework configuration
```

## Key Components

### Models (`src/models/`)

Contains data structures and storage implementations:

- `Position.ts` - Data models for trading positions
- `PositionStore.ts` - CRUD operations for position data
- `UserWalletMap.ts` - User-to-wallet mapping functionality
- `index.ts` - Consolidated exports

### Handlers (`src/handlers/`)

Message and command handlers for the Telegram bot:

- `commandHandlers.ts` - Processes bot commands
- `messageHandlers.ts` - Processes regular messages
- `callbackHandlers.ts` - Processes callback queries (buttons)

### Services (`src/services/`)

Core business logic:

- `positionService.ts` - Position management operations
- `walletService.ts` - Wallet connection and transaction services

### Utils (`src/utils/`)

Helper functions and utilities:

- `positionMonitor.ts` - Monitors position status and sends notifications
- `scheduler.ts` - Task scheduling functionality

### API (`src/api/`)

External API integrations:

- `DLMM.ts` - Meteora DLMM SDK integration

## Architectural Patterns

1. **Model-Handler-Service Pattern**
   - Models define data structures
   - Handlers process user inputs
   - Services implement business logic

2. **File-based Storage**
   - JSON files used for data persistence
   - Serialization/deserialization for complex types

3. **Task Scheduling**
   - Background tasks for monitoring
   - Configurable intervals and retry logic

4. **Dependency Injection**
   - Services and utilities injected into handlers
   - Improves testability and modularity 