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

## 仓位数据模型

项目包含完整的仓位数据模型，用于跟踪和管理流动性提供者的仓位。

### 主要组件

1. **Position 接口** - 定义仓位的核心属性:
   - 基本信息 (ID, 池地址, 代币对)
   - 仓位参数 (bin范围, 初始流动性)
   - 时间信息 (创建时间, 更新时间, 关闭时间)
   - 状态信息
   - 用户信息和附加数据

2. **PositionHistory 接口** - 跟踪仓位历史变更:
   - 关联仓位ID
   - 时间戳
   - 事件类型 (创建/更新/提取/关闭)
   - 快照数据 (流动性数值, 估值等)

3. **FilePositionStorage 类** - 提供基于文件系统的数据持久化:
   - 保存/加载仓位数据
   - 管理仓位历史记录
   - 支持查询和更新操作

### 使用示例

```typescript
// 创建存储实例
const positionStorage = new FilePositionStorage();

// 创建新仓位
const createParams: CreatePositionParams = {
  poolAddress: '池地址',
  tokenPair: {
    tokenASymbol: 'SOL',
    tokenBSymbol: 'USDC',
    // ...其他代币信息
  },
  lowerBinId: 8400,
  upperBinId: 8600,
  initialLiquidityA: new BN('500000000'),
  initialLiquidityB: new BN('10000000'),
  userWallet: '用户钱包地址'
};

// 创建并保存仓位
const position = positionStorage.createPosition(createParams);
await positionStorage.savePosition(position);

// 查询仓位
const allPositions = await positionStorage.getAllPositions();
const userPositions = await positionStorage.getPositionsByUser(userWallet);
```

运行示例:
```bash
npm run example:position
```

## 仓位监控与定时任务系统

项目现已添加了定时任务系统，可以自动监控所有活跃的仓位状态。主要功能包括：

### 定时任务管理

- 支持自定义监控间隔（默认为5分钟）
- 提供错误处理和自动重试机制（指数退避策略）
- 完善的日志记录系统

### 仓位监控功能

- 定时查询所有活跃仓位的状态
- 跟踪bin位置变化
- 记录价格和仓位历史数据

### Telegram命令

机器人支持以下与仓位监控相关的命令：

- `/help` - 显示所有可用命令及说明
- `/positions` - 显示所有仓位
- `/position <ID>` - 查看特定仓位详情
- `/wallets` - 管理关联的钱包地址
- `/start_monitoring [秒数]` - 开始仓位监控（可选参数指定间隔时间，默认10秒）
- `/stop_monitoring` - 停止仓位监控
- `/set_interval <秒数>` - 设置监控间隔，单位为秒
- `/check_now` - 立即检查所有仓位状态

### 使用示例

1. 初始化监控：
   ```
   /start_monitoring 
   ```
   启动监控，默认每10秒检查一次仓位状态

2. 自定义监控间隔：
   ```
   /start_monitoring 30
   ```
   启动监控，每30秒检查一次仓位状态

3. 修改监控间隔：
   ```
   /set_interval 5
   ```
   将监控间隔修改为5秒

4. 手动检查：
   ```
   /check_now
   ```
   立即执行一次所有仓位的状态检查

4. 停止监控：
   ```
   /stop_monitoring
   ```
   停止自动监控任务

### 日志系统

系统会自动记录所有操作日志，保存在 `data/logs/` 目录下，命名格式为 `scheduler_YYYY-MM-DD.log`。日志包含以下信息：

- 任务执行记录
- 错误信息与重试记录
- 通知发送记录