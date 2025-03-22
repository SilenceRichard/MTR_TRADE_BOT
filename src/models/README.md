# Models Directory

This directory contains data models and storage implementations for the MTR Trade Bot.

## Files

- **Position.ts**: Defines the data structures for positions in the Meteora liquidity pools, including position status, token pairs, and storage interfaces.
- **PositionStore.ts**: Implements file-based storage for positions, with methods for CRUD operations on position data.
- **UserWalletMap.ts**: Implements user-to-wallet address mapping functionality for linking Telegram users with their Solana wallets.
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