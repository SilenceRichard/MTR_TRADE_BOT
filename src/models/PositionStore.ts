import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import BN from 'bn.js';
import { Position, PositionHistory, PositionStorage, CreatePositionParams, PositionStatus } from './Position';

/**
 * 基于文件系统的仓位数据存储实现
 */
export class FilePositionStorage implements PositionStorage {
  private positionsPath: string;
  private historyPath: string;
  private positions: Map<string, Position> = new Map();
  private histories: Map<string, PositionHistory[]> = new Map();

  constructor(dataDir: string = path.join(process.cwd(), 'src', 'data')) {
    this.positionsPath = path.join(dataDir, 'positions.json');
    this.historyPath = path.join(dataDir, 'position_history.json');
    
    // 创建数据目录（如果不存在）
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // 加载现有数据
    this.loadData();
  }

  /**
   * 序列化Position对象以便存储
   */
  private serializePosition(position: Position): any {
    const serialized: any = {
      ...position,
      initialLiquidityA: position.initialLiquidityA?.toString(),
      initialLiquidityB: position.initialLiquidityB?.toString(),
      sellTokenAmount: position.sellTokenAmount?.toString(),
      expectedBuyAmount: position.expectedBuyAmount?.toString(),
      actualBuyAmount: position.actualBuyAmount?.toString(),
      createdAt: position.createdAt.toISOString(),
      updatedAt: position.updatedAt.toISOString(),
      closedAt: position.closedAt?.toISOString(),
      chatId: position.chatId ? Number(position.chatId) : undefined
    };
    
    // Delete the lastStatus from the serialized object to avoid type conflicts
    delete serialized.lastStatus;
    
    // 处理lastStatus字段
    if (position.lastStatus) {
      serialized.lastStatus = {
        activeBin: position.lastStatus.activeBin,
        currentPrice: position.lastStatus.currentPrice,
        binInRange: position.lastStatus.binInRange,
        timestamp: position.lastStatus.timestamp.toISOString()
      };
    }
    
    return serialized;
  }

  /**
   * 反序列化存储的对象为Position对象
   */
  private deserializePosition(data: any): Position {
    const position: Position = {
      ...data,
      initialLiquidityA: new BN(data.initialLiquidityA),
      initialLiquidityB: new BN(data.initialLiquidityB),
      sellTokenAmount: data.sellTokenAmount ? new BN(data.sellTokenAmount) : undefined,
      expectedBuyAmount: data.expectedBuyAmount ? new BN(data.expectedBuyAmount) : undefined,
      actualBuyAmount: data.actualBuyAmount ? new BN(data.actualBuyAmount) : undefined,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      closedAt: data.closedAt ? new Date(data.closedAt) : undefined,
      chatId: data.chatId ? Number(data.chatId) : undefined
    };
    
    // 处理lastStatus字段
    if (data.lastStatus) {
      position.lastStatus = {
        ...data.lastStatus,
        timestamp: new Date(data.lastStatus.timestamp)
      };
    }
    
    return position;
  }

  /**
   * 序列化PositionHistory对象
   */
  private serializeHistory(history: PositionHistory): any {
    const result: any = {
      ...history,
      timestamp: history.timestamp.toISOString()
    };
    
    if (history.liquidityA) {
      result.liquidityA = history.liquidityA.toString();
    }
    
    if (history.liquidityB) {
      result.liquidityB = history.liquidityB.toString();
    }
    
    return result;
  }

  /**
   * 反序列化PositionHistory对象
   */
  private deserializeHistory(data: any): PositionHistory {
    const result: any = {
      ...data,
      timestamp: new Date(data.timestamp)
    };
    
    if (data.liquidityA) {
      result.liquidityA = new BN(data.liquidityA);
    }
    
    if (data.liquidityB) {
      result.liquidityB = new BN(data.liquidityB);
    }
    
    return result;
  }

  /**
   * 从文件加载数据
   */
  private loadData(): void {
    try {
      if (fs.existsSync(this.positionsPath)) {
        const positionsData = JSON.parse(fs.readFileSync(this.positionsPath, 'utf-8'));
        
        for (const [id, posData] of Object.entries(positionsData)) {
          this.positions.set(id, this.deserializePosition(posData));
        }
      }
      
      if (fs.existsSync(this.historyPath)) {
        const historyData = JSON.parse(fs.readFileSync(this.historyPath, 'utf-8'));
        
        for (const [posId, histories] of Object.entries(historyData)) {
          this.histories.set(
            posId, 
            (histories as any[]).map(hist => this.deserializeHistory(hist))
          );
        }
      }
    } catch (error: any) {
      console.error('Error loading position data:', error);
      // 如果加载失败，使用空数据开始
      this.positions = new Map();
      this.histories = new Map();
    }
  }

  /**
   * 保存数据到文件
   */
  private async saveData(): Promise<void> {
    try {
      // 保存仓位数据
      const positionsObj: Record<string, any> = {};
      for (const [key, value] of this.positions.entries()) {
        positionsObj[key] = this.serializePosition(value);
      }
      
      fs.writeFileSync(this.positionsPath, JSON.stringify(positionsObj, null, 2));
      
      // 保存历史数据
      const historyObj: Record<string, any[]> = {};
      for (const [key, value] of this.histories.entries()) {
        historyObj[key] = value.map(hist => this.serializeHistory(hist));
      }
      
      fs.writeFileSync(this.historyPath, JSON.stringify(historyObj, null, 2));
    } catch (error: any) {
      console.error('Error saving position data:', error);
      throw new Error(`Failed to save position data: ${error.message}`);
    }
  }

  /**
   * 创建仓位
   */
  public createPosition(params: CreatePositionParams): Position {
    const now = new Date();
    const position: Position = {
      id: uuidv4(),
      poolAddress: params.poolAddress,
      tokenPair: params.tokenPair,
      lowerBinId: params.lowerBinId,
      upperBinId: params.upperBinId,
      lowerPriceLimit: params.lowerPriceLimit,
      upperPriceLimit: params.upperPriceLimit,
      initialLiquidityA: typeof params.initialLiquidityA === 'string' 
        ? new BN(params.initialLiquidityA) 
        : params.initialLiquidityA,
      initialLiquidityB: typeof params.initialLiquidityB === 'string' 
        ? new BN(params.initialLiquidityB) 
        : params.initialLiquidityB,
      // 添加交易意图信息
      sellTokenMint: params.sellTokenMint,
      sellTokenSymbol: params.sellTokenSymbol,
      sellTokenAmount: typeof params.sellTokenAmount === 'string' && params.sellTokenAmount
        ? (() => {
            try {
              return new BN(params.sellTokenAmount as string);
            } catch (error) {
              console.error("Invalid sellTokenAmount:", params.sellTokenAmount, error);
              return undefined;
            }
          })()
        : params.sellTokenAmount as BN | undefined,
      buyTokenMint: params.buyTokenMint,
      buyTokenSymbol: params.buyTokenSymbol,
      expectedBuyAmount: typeof params.expectedBuyAmount === 'string' && params.expectedBuyAmount
        ? (() => {
            try {
              return new BN(params.expectedBuyAmount as string);
            } catch (error) {
              console.error("Invalid expectedBuyAmount:", params.expectedBuyAmount, error);
              return undefined;
            }
          })()
        : params.expectedBuyAmount as BN | undefined,
      entryPrice: params.entryPrice,
      createdAt: now,
      updatedAt: now,
      status: PositionStatus.ACTIVE,
      userWallet: params.userWallet,
      chatId: params.chatId,
      fee: params.fee,
      notes: params.notes
    };
    
    this.positions.set(position.id, position);
    this.saveData();
    return position;
  }

  /**
   * 保存仓位
   */
  public async savePosition(position: Position): Promise<void> {
    this.positions.set(position.id, position);
    
    // 如果是新仓位，创建一条历史记录
    if (!this.histories.has(position.id)) {
      const historyEntry: PositionHistory = {
        id: uuidv4(),
        positionId: position.id,
        timestamp: new Date(),
        eventType: 'created',
        liquidityA: position.initialLiquidityA,
        liquidityB: position.initialLiquidityB,
        priceAtEvent: position.entryPrice,
        metadata: {
          lowerBinId: position.lowerBinId,
          upperBinId: position.upperBinId,
          sellTokenSymbol: position.sellTokenSymbol,
          sellTokenAmount: position.sellTokenAmount ? position.sellTokenAmount.toString() : undefined,
          buyTokenSymbol: position.buyTokenSymbol,
          expectedBuyAmount: position.expectedBuyAmount ? position.expectedBuyAmount.toString() : undefined
        }
      };
      
      this.histories.set(position.id, [historyEntry]);
    }
    
    await this.saveData();
  }

  /**
   * 获取单个仓位
   */
  public async getPosition(id: string): Promise<Position | null> {
    return this.positions.get(id) || null;
  }

  /**
   * 获取所有仓位
   */
  public async getAllPositions(): Promise<Position[]> {
    return Array.from(this.positions.values());
  }

  /**
   * 获取特定用户的仓位
   */
  public async getPositionsByUser(userWallet: string): Promise<Position[]> {
    return Array.from(this.positions.values()).filter(
      position => position.userWallet === userWallet
    );
  }

  /**
   * 根据聊天ID获取仓位
   */
  public async getPositionsByChatId(chatId: number): Promise<Position[]> {
    return Array.from(this.positions.values()).filter(
      position => position.chatId === chatId
    );
  }

  /**
   * 更新仓位信息
   */
  public async updatePosition(id: string, updates: Partial<Position>): Promise<void> {
    const position = this.positions.get(id);
    if (!position) {
      throw new Error(`Position with ID ${id} not found`);
    }
    
    // 更新仓位
    const updatedPosition = {
      ...position,
      ...updates,
      updatedAt: new Date() // 更新时间戳
    };
    
    this.positions.set(id, updatedPosition);
    
    // 创建历史记录
    const historyEntry: PositionHistory = {
      id: uuidv4(),
      positionId: id,
      timestamp: new Date(),
      eventType: 'updated',
      metadata: { updates: Object.keys(updates) }
    };
    
    // 添加到历史记录
    const positionHistory = this.histories.get(id) || [];
    positionHistory.push(historyEntry);
    this.histories.set(id, positionHistory);
    
    await this.saveData();
  }

  /**
   * 删除仓位
   */
  public async deletePosition(id: string): Promise<void> {
    if (!this.positions.has(id)) {
      throw new Error(`Position with ID ${id} not found`);
    }
    
    this.positions.delete(id);
    
    // 添加历史记录
    const historyEntry: PositionHistory = {
      id: uuidv4(),
      positionId: id,
      timestamp: new Date(),
      eventType: 'deleted'
    };
    
    const positionHistory = this.histories.get(id) || [];
    positionHistory.push(historyEntry);
    this.histories.set(id, positionHistory);
    
    await this.saveData();
  }

  /**
   * 保存仓位历史记录
   */
  public async savePositionHistory(history: PositionHistory): Promise<void> {
    const positionHistory = this.histories.get(history.positionId) || [];
    positionHistory.push(history);
    this.histories.set(history.positionId, positionHistory);
    
    await this.saveData();
  }

  /**
   * 获取仓位历史记录
   */
  public async getPositionHistory(positionId: string): Promise<PositionHistory[]> {
    return this.histories.get(positionId) || [];
  }
} 