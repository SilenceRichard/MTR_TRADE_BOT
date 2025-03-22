# MTR Trade Bot: Project Brief

## Introduction
**A specialized Telegram bot for trading and managing liquidity positions on Meteora's decentralized liquidity protocol for Solana blockchain.**

The MTR Trade Bot enables users to interact with Meteora's Decentralized Liquidity Market Maker (DLMM) protocol directly from Telegram. It simplifies discovering liquidity pools, connecting Solana wallets, creating and monitoring trading positions, all within an intuitive chat interface.

## Core Components/Features

### User Interface and Interaction
* Telegram Bot API integration for command handling and interactive menus
* Rich command set for pool searching, position management, and wallet connections
* Interactive keyboards and formatted messages for improved usability

### Wallet and Authentication
* Secure connection to Solana wallets for trading operations
* Optional Vault integration for encrypted seed phrase storage
* User-wallet mapping system for managing multiple wallets

### Meteora Protocol Integration
* Integration with Meteora DLMM SDK for pool operations
* Real-time pool data querying and display
* Support for creating liquidity positions across multiple bins

### Position Management System
* Complete position tracking with unique IDs
* Persistent storage of position data and history
* Automated monitoring of active positions with configurable intervals
* Real-time notifications of position status changes

### Trading Capabilities
* Token pair exchange functionality with price estimations
* Real-time exchange rate information
* Balance verification and swap confirmation workflow

## Implementation Guidelines

### System Architecture
The application follows a modular architecture pattern with clear separation of concerns:

**Core Components:**
- **Bot Module**: Central command routing and initialization
- **Handler Modules**: Specialized processors for commands, callbacks, and messages
- **Service Modules**: Business logic for positions, wallets, and queries
- **UI Components**: Menu generation and message formatting
- **Data Models**: Position storage and user wallet mapping

**Integration Points:**
- Solana blockchain via Web3.js
- Meteora protocol via DLMM SDK
- Telegram Bot API for user interaction

### Development Approach
Development should focus on maintaining the modular structure while ensuring robust error handling and security:

1. Each feature should be contained in its appropriate module
2. New commands should be added to the respective handler files
3. Business logic should remain in service modules
4. UI generation should be delegated to UI modules
5. Database operations should go through the storage models

### Security Considerations
- Wallet private keys should never be exposed in logs or messages
- Transaction signing should happen locally before broadcasting
- API calls must include proper error handling and timeouts
- User data should be encrypted when stored

## Key Points

- The project is built with TypeScript, leveraging strong typing for code safety
- Required dependencies include node-telegram-bot-api, @meteora-ag/dlmm, and @solana/web3.js
- Data persistence is implemented using file-based storage with JSON serialization
- The system includes sophisticated scheduling for position monitoring
- Error handling includes retry mechanisms with exponential backoff

Remember that the MTR Trade Bot is designed to be both powerful for experienced traders and accessible to newcomers to decentralized finance. The interface should provide sufficient information for informed decision-making while remaining intuitive and straightforward. 