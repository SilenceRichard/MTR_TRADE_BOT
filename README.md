# MTR_TRADE_BOT

A Telegram bot for interacting with Meteora decentralized liquidity protocol on Solana blockchain. The bot allows users to search for Meteora pools, view pool details, and create trading positions directly from the Telegram interface.

## Features

- Search and discover Meteora liquidity pools
- View detailed pool information including TVL, APR, trading volumes, and fees
- Connect to a Solana wallet for trading operations
- Create one-sided liquidity positions across multiple bins
- Configure trading parameters and strategies
- Real-time price data and position management

## Technical Architecture

The bot is built with TypeScript and leverages the following components:

### Core Components

- **Telegram Bot API**: Interface for user interactions
- **Meteora DLMM SDK**: Interacts with Meteora's Decentralized Liquidity Market Maker protocol
- **Solana Web3.js**: Blockchain interaction and transaction management
- **Vault Integration**: Secure wallet management with encrypted seed phrases

### Key Files

- `bot.ts`: Main bot logic and Telegram interaction handlers
- `queryPools.ts`: Functions for searching and displaying pool information
- `config.ts`: Configuration settings and type definitions
- `wallet.ts`: Wallet management and authentication
- `api/DLMM.ts`: Meteora DLMM API integration
- `api/pool.ts`: Pool querying and data fetching
- `utils/`: Helper utilities for formatting, wallet operations, and transaction building

## Setup and Deployment

### Prerequisites

- Node.js 16+ and npm/yarn
- A Solana wallet with SOL and tokens for trading
- Telegram Bot Token (obtain from BotFather)
- Optional: HashiCorp Vault for secure key management

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure the environment variables in `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   RPC=https://api.mainnet-beta.solana.com
   VAULT_ADDR=your_vault_address (optional)
   VAULT_TOKEN=your_vault_token (optional)
   VAULT_PATH=your_vault_path (optional)
   ```

### Running the Bot

Start the bot with:

```
npm start
```

## Usage Guide

1. **Start the Bot**: Send `/start` to initiate the bot
2. **Search for Pools**: Use the search functionality to find liquidity pools
3. **View Pool Details**: Select a pool to see detailed information
4. **Connect Wallet**: Connect your Solana wallet to perform operations
5. **Create Positions**:
   - Select a token to sell
   - Configure position parameters (bin range, amount)
   - Confirm the transaction

## Development

### Adding New Features

The codebase is structured to make adding new features straightforward:
- Add new command handlers in `bot.ts`
- Extend API functionality in the `api/` directory
- Add helper functions in the `utils/` directory

### Security Considerations

- The bot uses Vault for secure mnemonic storage and decryption
- Transaction signing happens locally before broadcasting to the network
- API calls use proper error handling and validation

## License

This project is licensed under the ISC License.