# Models Directory

This directory contains data models and storage implementations for the MTR Trade Bot.

## Files

- **Position.ts**: Defines the data structures for positions in the Meteora liquidity pools, including position status, token pairs, and storage interfaces.
- **PositionStore.ts**: Implements file-based storage for positions, with methods for CRUD operations on position data.
- **PrismaPositionStorage.ts**: Implements storage for positions using Prisma ORM.
- **UserWalletMap.ts**: Implements user-to-wallet address mapping functionality for linking Telegram users with their Solana wallets.
- **PrismaUserWalletMap.ts**: Implements storage for user-to-wallet mappings using Prisma ORM.
- **StorageFactory.ts**: Provides methods to get appropriate storage implementations based on the environment.
- **index.ts**: Exports all models for easier imports across the application.

## Usage

Import models in your application code using:

```typescript
import { Position, PositionStatus, FilePositionStorage } from '../models';
```

## Storage Implementation

The model implementations use a file-based storage system that serializes data to JSON files in the `src/data` directory. This provides persistence between application restarts while maintaining a simple implementation.

Key files created by the storage system:
- `positions.json`: Stores all position data
- `position_history.json`: Stores historical events for positions
- `user_wallet_mappings.json`: Stores user-to-wallet mappings

## Design Considerations

- Models use BN.js for handling Solana's large number values
- All models implement proper serialization/deserialization for persistence
- Position and wallet data are kept separate for modularity
- Historical data is maintained for positions to track changes over time 

## 数据模型目录（Model Directory）

该目录包含项目的数据模型定义和操作类。

### 模型结构

- `Position.ts` - 仓位接口定义
- `PositionStore.ts` - 基于文件系统的仓位存储实现
- `PrismaPositionStorage.ts` - 基于Prisma ORM的仓位存储实现
- `UserWalletMap.ts` - 用户钱包映射接口定义
- `PrismaUserWalletMap.ts` - 基于Prisma ORM的用户钱包映射存储实现
- `StorageFactory.ts` - 存储工厂，用于获取适当的存储实现
- `index.ts` - 模型导出文件

### 存储实现

项目支持两种存储实现方式：

1. **基于文件系统的存储**
   - `FilePositionStorage` - 仓位数据存储于本地JSON文件
   - `FileUserWalletMapStorage` - 用户钱包映射存储于本地JSON文件
   - 适用于小型应用和开发环境

2. **基于Prisma ORM的数据库存储**
   - `PrismaPositionStorage` - 仓位数据存储于数据库
   - `PrismaUserWalletMapStorage` - 用户钱包映射存储于数据库
   - 适用于生产环境和需要更高扩展性的应用

### 使用示例

```typescript
// 使用存储工厂获取合适的存储实现
import { StorageFactory, StorageType } from './models';

// 使用环境变量决定存储类型
const positionStorage = StorageFactory.getPositionStorage(
  StorageFactory.getStorageTypeFromEnv()
);

// 或者明确指定存储类型
const userWalletMapStorage = StorageFactory.getUserWalletMapStorage(
  StorageType.PRISMA
);

// 使用存储实现
const positions = await positionStorage.getAllPositions();
const users = await userWalletMapStorage.getAllUserWalletMaps();
```

### 数据库配置

当使用基于Prisma的存储实现时，需要确保：

1. 环境变量`DATABASE_URL`已正确设置
2. 环境变量`STORAGE_TYPE`设置为`prisma`
3. Prisma数据库已通过迁移初始化 