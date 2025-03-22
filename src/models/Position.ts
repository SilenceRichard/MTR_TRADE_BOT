import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

/**
 * 仓位状态枚举
 */
export enum PositionStatus {
  ACTIVE = 'active',    // 活跃状态
  CLOSED = 'closed',    // 已关闭
  PENDING = 'pending',  // 待处理/创建中
  ERROR = 'error'       // 错误状态
}

/**
 * 代币对信息接口
 */
export interface TokenPair {
  id?: string;          // 代币对唯一标识(数据库使用)
  tokenASymbol: string;  // 代币A符号
  tokenBSymbol: string;  // 代币B符号
  tokenAMint: string;    // 代币A mint地址
  tokenBMint: string;    // 代币B mint地址
  tokenADecimals: number;// 代币A小数位数
  tokenBDecimals: number;// 代币B小数位数
}

/**
 * 仓位数据模型
 */
export interface Position {
  // 基本信息
  id: string;                  // 仓位唯一标识符
  poolAddress: string;         // 池子地址
  tokenPair: TokenPair;        // 代币对信息
  
  // 仓位参数
  lowerBinId: number;          // 下限bin ID
  upperBinId: number;          // 上限bin ID
  initialLiquidityA: BN;       // 初始流动性金额(代币A)
  initialLiquidityB: BN;       // 初始流动性金额(代币B)
  
  // 价格范围信息
  lowerPriceLimit: number;     // 下限价格
  upperPriceLimit: number;     // 上限价格
  
  // 交易意图信息
  sellTokenMint?: string;      // 用户售出的代币Mint地址
  sellTokenSymbol?: string;    // 用户售出的代币符号
  sellTokenAmount?: BN;        // 用户售出的代币数量
  buyTokenMint?: string;       // 用户希望获得的代币Mint地址
  buyTokenSymbol?: string;     // 用户希望获得的代币符号
  expectedBuyAmount?: BN;      // 预期获得的代币数量
  actualBuyAmount?: BN;        // 实际获得的代币数量(关闭仓位后填充)
  entryPrice?: number;         // 创建仓位时的价格
  
  // 时间信息
  createdAt: Date;             // 创建时间
  updatedAt: Date;             // 最后更新时间
  closedAt?: Date;             // 关闭时间(如果已关闭)
  
  // 状态信息
  status: PositionStatus;      // 仓位状态
  lastStatus?: {               // 上次检查时的状态
    activeBin: number;         // 激活的bin ID
    currentPrice: number;      // 当前价格
    binInRange: boolean;       // bin是否在范围内
    timestamp: Date;           // 状态时间戳
    currentLowerPrice?: number; // 当前下限价格
    currentUpperPrice?: number; // 当前上限价格
    // 链上数据
    liquidityX?: string;       // X代币流动性
    liquidityY?: string;       // Y代币流动性
    fees?: {                   // 手续费信息
      pendingFeesX: BN;
      pendingFeesY: BN;
      totalClaimedFeesX: BN;
      totalClaimedFeesY: BN;
    };
    rewards?: {                // 奖励信息
      rewardOne: BN;
      rewardTwo: BN;
    };
    lastUpdatedAt?: string;    // 链上最后更新时间
  };
  
  // 用户信息
  userWallet: string;          // 用户钱包地址
  chatId?: number;             // Telegram聊天ID
  
  // 额外信息
  positionNFT?: string;        // 位置NFT地址(如果适用)
  fee?: number;                // 费率百分比
  notes?: string;              // 用户笔记
}

/**
 * 仓位历史记录接口
 */
export interface PositionHistory {
  id: string;                  // 历史记录ID
  positionId: string;          // 关联的仓位ID
  timestamp: Date;             // 记录时间
  eventType: string;           // 事件类型(创建/更新/提取/关闭等)
  
  // 快照数据
  liquidityA?: BN;             // 时间点的代币A流动性
  liquidityB?: BN;             // 时间点的代币B流动性
  valueUSD?: number;           // 估算的USD价值
  priceAtEvent?: number;       // 事件时的代币价格
  
  // 其他信息
  metadata?: Record<string, any>; // 额外元数据
}

/**
 * 创建新仓位的参数接口
 */
export interface CreatePositionParams {
  poolAddress: string;
  tokenPair: TokenPair;
  lowerBinId: number;
  upperBinId: number;
  lowerPriceLimit: number;     // 下限价格
  upperPriceLimit: number;     // 上限价格
  initialLiquidityA: BN | string;
  initialLiquidityB: BN | string;
  userWallet: string;
  chatId?: number;            // Telegram聊天ID
  sellTokenMint?: string;
  sellTokenSymbol?: string;
  sellTokenAmount?: BN | string;
  buyTokenMint?: string;
  buyTokenSymbol?: string;
  expectedBuyAmount?: BN | string;
  entryPrice?: number;
  fee?: number;
  notes?: string;
}

/**
 * 仓位数据存储类(接口定义)
 */
export interface PositionStorage {
  savePosition(position: Position): Promise<void>;
  getPosition(id: string): Promise<Position | null>;
  getAllPositions(): Promise<Position[]>;
  getPositionsByUser(userWallet: string): Promise<Position[]>;
  updatePosition(id: string, updates: Partial<Position>): Promise<void>;
  deletePosition(id: string): Promise<void>;
  savePositionHistory(history: PositionHistory): Promise<void>;
  getPositionHistory(positionId: string): Promise<PositionHistory[]>;
} 