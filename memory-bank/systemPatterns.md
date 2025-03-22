# 系统模式 (System Patterns)

*此文件记录项目中使用的模式、惯例和最佳实践。它为AI助手提供一致性指导，确保新代码遵循既定标准。*

## 🏗️ 架构模式

### 模块化架构

**用途:** 作为MTR Trade Bot的整体架构模式，用于分离关注点和管理复杂性。  
**实现:** 将系统分为独立但协作的模块，每个模块负责特定功能领域。  
**示例:** 
```typescript
// bot/index.ts - 主模块入口点
import { TelegramBot } from 'node-telegram-bot-api';
import { CommandHandler } from '../handlers/command';
import { CallbackHandler } from '../handlers/callback';
import { MessageHandler } from '../handlers/message';

export class MtrBot {
  private bot: TelegramBot;
  private commandHandler: CommandHandler;
  private callbackHandler: CallbackHandler;
  private messageHandler: MessageHandler;
  
  constructor(token: string) {
    this.bot = new TelegramBot(token, { polling: true });
    this.commandHandler = new CommandHandler();
    this.callbackHandler = new CallbackHandler();
    this.messageHandler = new MessageHandler();
    
    this.initializeHandlers();
  }
  
  private initializeHandlers(): void {
    // 设置命令处理器
    this.bot.on('command', (msg) => this.commandHandler.handle(msg));
    
    // 设置回调查询处理器
    this.bot.on('callback_query', (query) => this.callbackHandler.handle(query));
    
    // 设置消息处理器
    this.bot.on('message', (msg) => this.messageHandler.handle(msg));
  }
  
  public start(): void {
    console.log('MTR Trade Bot is running...');
  }
}
```

**注意事项:**
- 模块间通信应通过定义良好的接口进行
- 避免模块间的循环依赖
- 每个模块应有单一职责
- 模块内的组件应高内聚，模块间应低耦合

### 依赖注入

**用途:** 管理组件依赖关系，提高可测试性和灵活性。  
**实现:** 通过构造函数或setter方法注入依赖，而非直接实例化。  
**示例:** 
```typescript
// 不好的实践 - 直接实例化依赖
class PositionService {
  private meteora = new MeteoraClient();
  
  // 方法实现...
}

// 好的实践 - 依赖通过构造函数注入
class PositionService {
  constructor(private readonly meteora: MeteoraClient) {}
  
  // 方法实现...
}

// 使用时可以注入真实实例或测试替身
const meteoraClient = new MeteoraClient(config);
const positionService = new PositionService(meteoraClient);
```

**注意事项:**
- 考虑使用简单的DI容器或工厂来管理复杂依赖关系
- 避免过度使用导致"配置地狱"
- 依赖应该是接口或抽象类，而非具体实现

## 💻 编码规范

### 通用规范

- 使用ESLint和Prettier确保代码风格一致性
- 使用有意义的变量和函数名称
- 避免魔法数字和字符串，使用常量
- 保持函数简短，单一职责
- 使用异步/等待模式处理异步操作
- 使用TypeScript严格模式和类型检查

### TypeScript/Node.js 规范

- 优先使用接口(interface)定义对象结构
- 使用类型别名(type)定义联合类型和复杂类型
- 确保所有函数参数和返回值都有类型注解
- 使用枚举(enum)表示有限选项集
- 适当使用泛型增强代码复用性
- 避免使用`any`类型，优先使用`unknown`或具体类型

### 错误处理

**标准方法:**
```typescript
// 服务层错误处理示例
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public isOperational = true,
    stack = ''
  ) {
    super(message);
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// 使用示例
async function fetchPoolData(poolId: string) {
  try {
    const response = await api.get(`/pools/${poolId}`);
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new ApiError(
        error.response.status,
        `Failed to fetch pool data: ${error.response.data.message}`,
        true
      );
    }
    throw new ApiError(500, 'Internal server error', false, error.stack);
  }
}
```

**日志记录:**
```typescript
// 使用结构化日志记录
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// 如果不是生产环境，也将日志打印到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// 使用示例
try {
  // 操作代码
} catch (error) {
  logger.error('Error occurred', {
    errorMessage: error.message,
    stack: error.stack,
    operationContext: { /* 相关上下文 */ }
  });
}
```

## 🔄 设计模式

### 观察者模式

**用途:** 用于实现位置监控系统，当位置状态变化时通知观察者。  
**适用场景:** 当对象状态变化需要通知多个依赖对象时。  
**实现:**
```typescript
// 简化的观察者模式实现
interface Observer {
  update(subject: Subject): void;
}

class Subject {
  private observers: Observer[] = [];
  
  public addObserver(observer: Observer): void {
    this.observers.push(observer);
  }
  
  public removeObserver(observer: Observer): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }
  
  protected notifyObservers(): void {
    for (const observer of this.observers) {
      observer.update(this);
    }
  }
}

// 位置监控具体实现
class Position extends Subject {
  private _status: string;
  
  constructor(private id: string, private userId: string) {
    super();
    this._status = 'active';
  }
  
  get status(): string {
    return this._status;
  }
  
  set status(value: string) {
    if (this._status !== value) {
      this._status = value;
      this.notifyObservers();
    }
  }
}

class TelegramNotifier implements Observer {
  constructor(private bot: TelegramBot, private chatId: string) {}
  
  update(subject: Position): void {
    this.bot.sendMessage(
      this.chatId,
      `Position status changed to: ${subject.status}`
    );
  }
}
```

### 策略模式

**用途:** 用于实现不同的交易策略或流动性提供策略。  
**适用场景:** 当需要在运行时选择不同算法或策略时。  
**实现:**
```typescript
// 交易策略接口
interface TradingStrategy {
  executeSwap(
    fromToken: string, 
    toToken: string, 
    amount: number
  ): Promise<SwapResult>;
}

// 具体策略实现
class MarketOrderStrategy implements TradingStrategy {
  constructor(private meteora: MeteoraClient) {}
  
  async executeSwap(
    fromToken: string, 
    toToken: string, 
    amount: number
  ): Promise<SwapResult> {
    // 实现市价单逻辑
    return await this.meteora.swap(fromToken, toToken, amount);
  }
}

class LimitOrderStrategy implements TradingStrategy {
  constructor(
    private meteora: MeteoraClient,
    private maxSlippage: number
  ) {}
  
  async executeSwap(
    fromToken: string, 
    toToken: string, 
    amount: number
  ): Promise<SwapResult> {
    // 实现限价单逻辑
    const quote = await this.meteora.getQuote(fromToken, toToken, amount);
    
    if (quote.slippage <= this.maxSlippage) {
      return await this.meteora.swap(fromToken, toToken, amount, {
        slippagePercentage: this.maxSlippage
      });
    }
    
    throw new Error('Slippage exceeds maximum allowed');
  }
}

// 交易上下文
class TradingContext {
  constructor(private strategy: TradingStrategy) {}
  
  setStrategy(strategy: TradingStrategy): void {
    this.strategy = strategy;
  }
  
  async executeSwap(
    fromToken: string, 
    toToken: string, 
    amount: number
  ): Promise<SwapResult> {
    return await this.strategy.executeSwap(fromToken, toToken, amount);
  }
}
```

## 📊 数据模式

### 数据访问

**标准方法:**
```typescript
// 基于文件的数据访问层
import fs from 'fs/promises';
import path from 'path';

export abstract class BaseRepository<T> {
  constructor(private storagePath: string) {}
  
  protected async readData(): Promise<T[]> {
    try {
      const filePath = path.join(this.storagePath, this.getFileName());
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回空数组
        return [];
      }
      throw error;
    }
  }
  
  protected async writeData(data: T[]): Promise<void> {
    const filePath = path.join(this.storagePath, this.getFileName());
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }
  
  abstract getFileName(): string;
}

// 具体实现示例
interface PositionData {
  id: string;
  userId: string;
  poolId: string;
  status: string;
  // 其他位置相关字段
}

class PositionRepository extends BaseRepository<PositionData> {
  constructor(storagePath: string) {
    super(storagePath);
  }
  
  getFileName(): string {
    return 'positions.json';
  }
  
  async findById(id: string): Promise<PositionData | null> {
    const positions = await this.readData();
    return positions.find(p => p.id === id) || null;
  }
  
  async findByUserId(userId: string): Promise<PositionData[]> {
    const positions = await this.readData();
    return positions.filter(p => p.userId === userId);
  }
  
  async save(position: PositionData): Promise<void> {
    const positions = await this.readData();
    const index = positions.findIndex(p => p.id === position.id);
    
    if (index !== -1) {
      positions[index] = position;
    } else {
      positions.push(position);
    }
    
    await this.writeData(positions);
  }
  
  async delete(id: string): Promise<void> {
    let positions = await this.readData();
    positions = positions.filter(p => p.id !== id);
    await this.writeData(positions);
  }
}
```

### 数据验证

**标准方法:**
```typescript
// 使用Joi进行数据验证
import Joi from 'joi';

// 位置创建验证模式
const createPositionSchema = Joi.object({
  userId: Joi.string().required(),
  poolId: Joi.string().required(),
  lowerBin: Joi.number().integer().min(0).required(),
  upperBin: Joi.number().integer().min(Joi.ref('lowerBin')).required(),
  amount: Joi.number().positive().required(),
  token: Joi.string().required()
});

// 验证函数
function validateCreatePosition(data: unknown): { value: any, error?: string } {
  const { error, value } = createPositionSchema.validate(data);
  
  if (error) {
    return { 
      value: data, 
      error: error.details.map(detail => detail.message).join(', ') 
    };
  }
  
  return { value };
}

// 使用示例
async function createPosition(data: unknown) {
  const { value, error } = validateCreatePosition(data);
  
  if (error) {
    throw new Error(`Invalid position data: ${error}`);
  }
  
  // 继续创建位置的逻辑...
}
```

## 🧪 测试模式

### 单元测试

**标准结构:**
```typescript
// 使用Jest进行单元测试
import { PositionService } from '../services/position';
import { MeteoraClient } from '../api/meteora';

// 模拟MeteoraClient
jest.mock('../api/meteora');

describe('PositionService', () => {
  let positionService: PositionService;
  let mockMeteoraClient: jest.Mocked<MeteoraClient>;
  
  beforeEach(() => {
    // 重置所有模拟并创建新实例
    jest.clearAllMocks();
    mockMeteoraClient = new MeteoraClient() as jest.Mocked<MeteoraClient>;
    positionService = new PositionService(mockMeteoraClient);
  });
  
  describe('createPosition', () => {
    it('should create a position successfully', async () => {
      // 安排 - 设置测试数据和模拟
      const positionData = {
        userId: 'user123',
        poolId: 'pool456',
        lowerBin: 10,
        upperBin: 20,
        amount: 100,
        token: 'SOL'
      };
      
      mockMeteoraClient.createPosition.mockResolvedValue({
        id: 'pos789',
        ...positionData,
        status: 'active'
      });
      
      // 执行 - 调用被测试的方法
      const result = await positionService.createPosition(positionData);
      
      // 断言 - 验证结果
      expect(result).toHaveProperty('id', 'pos789');
      expect(result.status).toBe('active');
      expect(mockMeteoraClient.createPosition).toHaveBeenCalledWith(
        positionData.poolId,
        positionData.lowerBin,
        positionData.upperBin,
        positionData.amount,
        positionData.token
      );
    });
    
    it('should throw error when meteora client fails', async () => {
      // 安排
      const positionData = {
        userId: 'user123',
        poolId: 'pool456',
        lowerBin: 10,
        upperBin: 20,
        amount: 100,
        token: 'SOL'
      };
      
      const errorMessage = 'Failed to create position';
      mockMeteoraClient.createPosition.mockRejectedValue(new Error(errorMessage));
      
      // 执行 & 断言
      await expect(positionService.createPosition(positionData))
        .rejects.toThrow(errorMessage);
    });
  });
});
```

### 集成测试

**标准方法:**
```typescript
// 使用Supertest进行API集成测试
import request from 'supertest';
import { app } from '../app';
import { setupDatabase, cleanupDatabase } from './utils/db-setup';

describe('Position API', () => {
  beforeAll(async () => {
    await setupDatabase();
  });
  
  afterAll(async () => {
    await cleanupDatabase();
  });
  
  describe('POST /api/positions', () => {
    it('should create a new position', async () => {
      const userData = {
        userId: 'user123',
        poolId: 'pool456',
        lowerBin: 10,
        upperBin: 20,
        amount: 100,
        token: 'SOL'
      };
      
      const response = await request(app)
        .post('/api/positions')
        .send(userData)
        .expect(201);
      
      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe('active');
    });
    
    it('should return 400 with invalid data', async () => {
      const invalidData = {
        // 缺少必要字段
        userId: 'user123',
        poolId: 'pool456'
      };
      
      const response = await request(app)
        .post('/api/positions')
        .send(invalidData)
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
    });
  });
});
```

## 📱 UI组件模式

### Telegram菜单组件

**用途:** 创建交互式Telegram菜单按钮。  
**实现:**
```typescript
// UI/menu.ts
import { InlineKeyboardButton, InlineKeyboardMarkup } from 'node-telegram-bot-api';

export class MenuBuilder {
  private buttons: InlineKeyboardButton[][] = [];
  
  /**
   * 添加一行按钮
   */
  public addRow(...buttons: InlineKeyboardButton[]): MenuBuilder {
    this.buttons.push(buttons);
    return this;
  }
  
  /**
   * 添加一个普通按钮
   */
  public addButton(text: string, callbackData: string): MenuBuilder {
    const lastRow = this.getOrCreateLastRow();
    lastRow.push({ text, callback_data: callbackData });
    return this;
  }
  
  /**
   * 添加一个URL按钮
   */
  public addUrlButton(text: string, url: string): MenuBuilder {
    const lastRow = this.getOrCreateLastRow();
    lastRow.push({ text, url });
    return this;
  }
  
  /**
   * 返回Telegram键盘标记
   */
  public build(): InlineKeyboardMarkup {
    return { inline_keyboard: this.buttons };
  }
  
  private getOrCreateLastRow(): InlineKeyboardButton[] {
    if (this.buttons.length === 0) {
      this.buttons.push([]);
    }
    return this.buttons[this.buttons.length - 1];
  }
}

// 使用示例
const menu = new MenuBuilder()
  .addButton('View Pools', 'pools:list')
  .addRow()
  .addButton('My Positions', 'positions:list')
  .addRow()
  .addUrlButton('Meteora Docs', 'https://docs.meteora.ag')
  .build();
```

### 消息格式化组件

**用途:** 创建一致的消息格式。  
**实现:**
```typescript
// UI/formatter.ts
export class MessageFormatter {
  /**
   * 创建池信息消息
   */
  public static formatPoolInfo(pool: Pool): string {
    return `
*Pool Info: ${pool.name}*
Token Pair: ${pool.token0}/${pool.token1}
Total Liquidity: ${pool.totalLiquidity}
24h Volume: ${pool.volume24h}
Current Bin: ${pool.currentBin}
Bin Step: ${pool.binStep}%

[View on Explorer](${pool.explorerUrl})
    `.trim();
  }
  
  /**
   * 创建位置信息消息
   */
  public static formatPositionInfo(position: Position): string {
    return `
*Position ID: ${position.id}*
Status: ${position.status}
Pool: ${position.poolName}
Range: ${position.lowerBin} - ${position.upperBin}
Amount: ${position.amount} ${position.token}
Created: ${this.formatDate(position.createdAt)}

${this.formatPositionStatus(position)}
    `.trim();
  }
  
  private static formatPositionStatus(position: Position): string {
    switch (position.status) {
      case 'active':
        return '✅ Position is active';
      case 'out_of_range':
        return '⚠️ Position is currently out of range';
      case 'closed':
        return '❌ Position is closed';
      default:
        return `Status: ${position.status}`;
    }
  }
  
  private static formatDate(date: Date): string {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
```

## 🔒 安全模式

### 认证

**标准方法:**
```typescript
// 使用公钥认证Solana钱包
import { Connection, PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';

interface AuthenticationRequest {
  publicKey: string;
  signature: string;
  message: string;
}

async function verifyWalletSignature(
  auth: AuthenticationRequest
): Promise<boolean> {
  try {
    const message = new TextEncoder().encode(auth.message);
    const signature = bs58.decode(auth.signature);
    const publicKey = new PublicKey(auth.publicKey);
    
    return nacl.sign.detached.verify(
      message,
      signature,
      publicKey.toBytes()
    );
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

// 使用示例
async function authenticateUser(authRequest: AuthenticationRequest): Promise<string | null> {
  const isValid = await verifyWalletSignature(authRequest);
  
  if (isValid) {
    // 生成会话令牌或返回用户ID
    return authRequest.publicKey;
  }
  
  return null;
}
```

### 授权

**标准方法:**
```typescript
// 简单的用户-钱包映射授权
interface UserWalletMapping {
  userId: string;
  wallets: {
    publicKey: string;
    label: string;
    permissions: WalletPermission[];
  }[];
}

enum WalletPermission {
  VIEW = 'view',
  TRADE = 'trade',
  PROVIDE_LIQUIDITY = 'provide_liquidity'
}

class AuthorizationService {
  private userWalletMap: Map<string, UserWalletMapping> = new Map();
  
  async hasPermission(
    userId: string,
    publicKey: string,
    permission: WalletPermission
  ): Promise<boolean> {
    const userMapping = this.userWalletMap.get(userId);
    
    if (!userMapping) {
      return false;
    }
    
    const wallet = userMapping.wallets.find(w => w.publicKey === publicKey);
    
    if (!wallet) {
      return false;
    }
    
    return wallet.permissions.includes(permission);
  }
  
  async checkAuthorization(
    userId: string,
    publicKey: string,
    requiredPermission: WalletPermission
  ): Promise<void> {
    const hasPermission = await this.hasPermission(
      userId, 
      publicKey, 
      requiredPermission
    );
    
    if (!hasPermission) {
      throw new Error('Unauthorized access');
    }
  }
}
```

### 数据保护

**标准方法:**
```typescript
// 使用环境变量和配置文件保护敏感数据
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

// 加载环境变量
dotenv.config();

// 安全配置类
class SecureConfig {
  private static instance: SecureConfig;
  private config: Record<string, any> = {};
  
  private constructor() {
    // 私有构造函数，强制使用单例模式
  }
  
  public static getInstance(): SecureConfig {
    if (!SecureConfig.instance) {
      SecureConfig.instance = new SecureConfig();
    }
    return SecureConfig.instance;
  }
  
  public async load(configPath: string): Promise<void> {
    try {
      const data = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(data);
    } catch (error) {
      console.error(`Failed to load config from ${configPath}:`, error);
      throw new Error('Config loading failed');
    }
  }
  
  public get<T>(key: string, defaultValue?: T): T {
    // 首先检查环境变量
    const envKey = key.toUpperCase().replace(/\./g, '_');
    if (process.env[envKey] !== undefined) {
      return process.env[envKey] as unknown as T;
    }
    
    // 然后检查配置文件
    const paths = key.split('.');
    let current: any = this.config;
    
    for (const path of paths) {
      if (current[path] === undefined) {
        return defaultValue as T;
      }
      current = current[path];
    }
    
    return current as T;
  }
}

// 使用示例
const config = SecureConfig.getInstance();
await config.load(path.join(__dirname, '../config/default.json'));

const apiKey = config.get<string>('api.key');
const endpoint = config.get<string>('api.endpoint', 'https://default-api.com');
```

## 🚀 性能优化模式

### 缓存策略

**标准实现:**
```typescript
// 简单的内存缓存实现
class MemoryCache<T> {
  private cache: Map<string, { value: T, expiry: number }> = new Map();
  
  /**
   * 获取缓存项
   */
  public get(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }
    
    // 检查是否过期
    if (item.expiry < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
  
  /**
   * 设置缓存项
   * @param ttl 过期时间（毫秒）
   */
  public set(key: string, value: T, ttl: number = 60000): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  }
  
  /**
   * 删除缓存项
   */
  public delete(key: string): void {
    this.cache.delete(key);
  }
  
  /**
   * 清空缓存
   */
  public clear(): void {
    this.cache.clear();
  }
  
  /**
   * 清理过期缓存项
   */
  public cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (item.expiry < now) {
        this.cache.delete(key);
      }
    }
  }
}

// 服务中使用缓存
class PoolService {
  private cache: MemoryCache<Pool[]> = new MemoryCache();
  
  constructor(private readonly meteoraClient: MeteoraClient) {}
  
  async getPools(): Promise<Pool[]> {
    const cacheKey = 'all_pools';
    const cachedPools = this.cache.get(cacheKey);
    
    if (cachedPools) {
      return cachedPools;
    }
    
    const pools = await this.meteoraClient.getPools();
    
    // 缓存10分钟
    this.cache.set(cacheKey, pools, 10 * 60 * 1000);
    
    return pools;
  }
}
```

### 批处理

**标准实现:**
```typescript
// 批处理位置更新
class PositionMonitor {
  private positions: Map<string, Position> = new Map();
  private updateQueue: string[] = [];
  private isProcessing: boolean = false;
  
  constructor(
    private readonly positionService: PositionService,
    private readonly meteoraClient: MeteoraClient,
    private readonly batchSize: number = 10,
    private readonly processingInterval: number = 5000
  ) {}
  
  /**
   * 添加位置到监控队列
   */
  public trackPosition(position: Position): void {
    this.positions.set(position.id, position);
    this.queueUpdate(position.id);
  }
  
  /**
   * 将位置ID添加到更新队列
   */
  private queueUpdate(positionId: string): void {
    if (!this.updateQueue.includes(positionId)) {
      this.updateQueue.push(positionId);
    }
    
    // 如果处理器未运行，启动它
    if (!this.isProcessing) {
      this.processQueue();
    }
  }
  
  /**
   * 批量处理更新队列
   */
  private async processQueue(): Promise<void> {
    if (this.updateQueue.length === 0) {
      this.isProcessing = false;
      return;
    }
    
    this.isProcessing = true;
    
    // 从队列中获取一批位置
    const batch = this.updateQueue.splice(0, this.batchSize);
    const positionsToUpdate = batch
      .map(id => this.positions.get(id))
      .filter((p): p is Position => !!p);
    
    try {
      // 批量获取位置更新
      const updates = await Promise.all(
        positionsToUpdate.map(p => 
          this.meteoraClient.getPositionStatus(p.poolId, p.id)
        )
      );
      
      // 更新位置状态
      for (let i = 0; i < positionsToUpdate.length; i++) {
        const position = positionsToUpdate[i];
        const update = updates[i];
        
        if (position.status !== update.status) {
          position.status = update.status;
          await this.positionService.updatePosition(position);
          // 触发通知等操作...
        }
      }
    } catch (error) {
      console.error('Error processing position updates:', error);
      // 将失败的位置重新加入队列
      batch.forEach(id => this.queueUpdate(id));
    }
    
    // 安排下一批处理
    setTimeout(() => this.processQueue(), this.processingInterval);
  }
}
```

## 🔔 通知模式

### 仓位监控通知模式

**用途:** 确保用户及时收到仓位状态变更的通知，特别是新创建仓位的初始通知。  
**实现:** 通过立即检查机制和状态变更检测的组合来触发通知。  
**关键点:**
1. 新仓位创建后应立即触发检查，而不仅依赖定时任务
2. 对每个通知条件进行明确的日志记录
3. 确保用户ID和仓位关联正确

**示例:** 
```typescript
// 仓位创建完成后立即触发检查
const position = positionStorage.createPosition(createParams);
await positionMonitor.checkNewPosition(position.id);

// 新仓位检查方法
public async checkNewPosition(positionId: string): Promise<void> {
  try {
    const position = await this.positionStorage.getPosition(positionId);
    if (!position) {
      taskScheduler.log(LogLevel.ERROR, `Cannot check new position: Position not found with ID ${positionId}`);
      return;
    }
    
    taskScheduler.log(LogLevel.INFO, `Performing immediate check for new position ${positionId}`);
    await this.checkPositionStatus(position);
    return;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    taskScheduler.log(LogLevel.ERROR, `Error checking new position ${positionId}`, { error: errorMsg });
  }
}

// 检查通知条件的逻辑，确保新仓位立即发送通知
if (!position.lastStatus) {
  message += `✅ *New position is now being monitored*\n\n`;
  shouldNotify = true;
  taskScheduler.log(LogLevel.INFO, `New position detected, sending notification for position: ${position.id}`);
}
```

**修复常见问题:**
1. 缺少立即检查 - 新仓位创建后立即调用`checkNewPosition`
2. 通知缺失 - 确保`chatId`正确设置和获取
3. 日志不足 - 添加详细日志追踪通知流程的每个步骤

**注意事项:**
- 新仓位通知应包含足够的初始状态信息
- 避免在短时间内发送重复通知
- 记录通知发送失败的情况并尝试恢复

---

*最后更新时间: 2023-07-10* 