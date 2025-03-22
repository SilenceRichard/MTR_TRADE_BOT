import BN from 'bn.js';
import { v4 as uuidv4 } from 'uuid';
import { Position, PositionHistory, PositionStorage, CreatePositionParams, PositionStatus } from './Position';
import { prisma } from '../lib/prisma';

/**
 * 基于Prisma ORM的仓位数据存储实现
 */
export class PrismaPositionStorage implements PositionStorage {
  
  /**
   * 将Position对象转换为数据库存储格式
   */
  private convertPositionToDb(position: Position) {
    const tokenPairData = {
      tokenASymbol: position.tokenPair.tokenASymbol,
      tokenBSymbol: position.tokenPair.tokenBSymbol,
      tokenAMint: position.tokenPair.tokenAMint,
      tokenBMint: position.tokenPair.tokenBMint,
      tokenADecimals: position.tokenPair.tokenADecimals,
      tokenBDecimals: position.tokenPair.tokenBDecimals,
    };

    let lastStatusData = null;
    if (position.lastStatus) {
      lastStatusData = {
        activeBin: position.lastStatus.activeBin,
        currentPrice: position.lastStatus.currentPrice,
        binInRange: position.lastStatus.binInRange,
        timestamp: position.lastStatus.timestamp,
        currentLowerPrice: position.lastStatus.currentLowerPrice,
        currentUpperPrice: position.lastStatus.currentUpperPrice,
        liquidityX: position.lastStatus.liquidityX,
        liquidityY: position.lastStatus.liquidityY,
        pendingFeesX: position.lastStatus.fees?.pendingFeesX.toString(),
        pendingFeesY: position.lastStatus.fees?.pendingFeesY.toString(),
        totalClaimedFeesX: position.lastStatus.fees?.totalClaimedFeesX.toString(),
        totalClaimedFeesY: position.lastStatus.fees?.totalClaimedFeesY.toString(),
        rewardOne: position.lastStatus.rewards?.rewardOne.toString(),
        rewardTwo: position.lastStatus.rewards?.rewardTwo.toString(),
        lastUpdatedAt: position.lastStatus.lastUpdatedAt
      };
    }

    return {
      tokenPair: {
        connectOrCreate: {
          where: {
            id: position.tokenPair.id ?? uuidv4(),
          },
          create: tokenPairData,
        },
      },
      lastStatus: lastStatusData ? {
        create: lastStatusData
      } : undefined,
      // Position fields
      id: position.id,
      poolAddress: position.poolAddress,
      lowerBinId: position.lowerBinId,
      upperBinId: position.upperBinId,
      initialLiquidityA: position.initialLiquidityA.toString(),
      initialLiquidityB: position.initialLiquidityB.toString(),
      lowerPriceLimit: position.lowerPriceLimit,
      upperPriceLimit: position.upperPriceLimit,
      sellTokenMint: position.sellTokenMint,
      sellTokenSymbol: position.sellTokenSymbol,
      sellTokenAmount: position.sellTokenAmount?.toString(),
      buyTokenMint: position.buyTokenMint,
      buyTokenSymbol: position.buyTokenSymbol,
      expectedBuyAmount: position.expectedBuyAmount?.toString(),
      actualBuyAmount: position.actualBuyAmount?.toString(),
      entryPrice: position.entryPrice,
      status: position.status,
      userWallet: position.userWallet,
      chatId: position.chatId,
      positionNFT: position.positionNFT,
      fee: position.fee,
      notes: position.notes,
    };
  }

  /**
   * 将数据库对象转换为Position对象
   */
  private convertDbToPosition(dbPosition: any, tokenPair: any, lastStatus: any): Position {
    const position: Position = {
      id: dbPosition.id,
      poolAddress: dbPosition.poolAddress,
      tokenPair: {
        id: tokenPair.id,
        tokenASymbol: tokenPair.tokenASymbol,
        tokenBSymbol: tokenPair.tokenBSymbol,
        tokenAMint: tokenPair.tokenAMint,
        tokenBMint: tokenPair.tokenBMint,
        tokenADecimals: tokenPair.tokenADecimals,
        tokenBDecimals: tokenPair.tokenBDecimals,
      },
      lowerBinId: dbPosition.lowerBinId,
      upperBinId: dbPosition.upperBinId,
      initialLiquidityA: new BN(dbPosition.initialLiquidityA),
      initialLiquidityB: new BN(dbPosition.initialLiquidityB),
      lowerPriceLimit: dbPosition.lowerPriceLimit,
      upperPriceLimit: dbPosition.upperPriceLimit,
      sellTokenMint: dbPosition.sellTokenMint,
      sellTokenSymbol: dbPosition.sellTokenSymbol,
      sellTokenAmount: dbPosition.sellTokenAmount ? new BN(dbPosition.sellTokenAmount) : undefined,
      buyTokenMint: dbPosition.buyTokenMint,
      buyTokenSymbol: dbPosition.buyTokenSymbol,
      expectedBuyAmount: dbPosition.expectedBuyAmount ? new BN(dbPosition.expectedBuyAmount) : undefined,
      actualBuyAmount: dbPosition.actualBuyAmount ? new BN(dbPosition.actualBuyAmount) : undefined,
      entryPrice: dbPosition.entryPrice,
      createdAt: dbPosition.createdAt,
      updatedAt: dbPosition.updatedAt,
      closedAt: dbPosition.closedAt,
      status: dbPosition.status as PositionStatus,
      userWallet: dbPosition.userWallet,
      chatId: dbPosition.chatId,
      positionNFT: dbPosition.positionNFT,
      fee: dbPosition.fee,
      notes: dbPosition.notes,
    };

    // 如果有lastStatus数据，转换它
    if (lastStatus) {
      position.lastStatus = {
        activeBin: lastStatus.activeBin,
        currentPrice: lastStatus.currentPrice,
        binInRange: lastStatus.binInRange,
        timestamp: lastStatus.timestamp,
        currentLowerPrice: lastStatus.currentLowerPrice,
        currentUpperPrice: lastStatus.currentUpperPrice,
        liquidityX: lastStatus.liquidityX,
        liquidityY: lastStatus.liquidityY,
        lastUpdatedAt: lastStatus.lastUpdatedAt,
      };

      // 添加费用数据（如果有）
      if (lastStatus.pendingFeesX || lastStatus.pendingFeesY) {
        position.lastStatus.fees = {
          pendingFeesX: new BN(lastStatus.pendingFeesX || '0'),
          pendingFeesY: new BN(lastStatus.pendingFeesY || '0'),
          totalClaimedFeesX: new BN(lastStatus.totalClaimedFeesX || '0'),
          totalClaimedFeesY: new BN(lastStatus.totalClaimedFeesY || '0'),
        };
      }

      // 添加奖励数据（如果有）
      if (lastStatus.rewardOne || lastStatus.rewardTwo) {
        position.lastStatus.rewards = {
          rewardOne: new BN(lastStatus.rewardOne || '0'),
          rewardTwo: new BN(lastStatus.rewardTwo || '0'),
        };
      }
    }

    return position;
  }

  /**
   * 将数据库对象转换为PositionHistory对象
   */
  private convertDbToPositionHistory(dbHistory: any): PositionHistory {
    const history: PositionHistory = {
      id: dbHistory.id,
      positionId: dbHistory.positionId,
      timestamp: dbHistory.timestamp,
      eventType: dbHistory.eventType,
      liquidityA: dbHistory.liquidityA ? new BN(dbHistory.liquidityA) : undefined,
      liquidityB: dbHistory.liquidityB ? new BN(dbHistory.liquidityB) : undefined,
      valueUSD: dbHistory.valueUSD,
      priceAtEvent: dbHistory.priceAtEvent,
    };

    // 如果有元数据，解析JSON字符串
    if (dbHistory.metadataJson) {
      history.metadata = JSON.parse(dbHistory.metadataJson);
    }

    return history;
  }

  /**
   * 创建新仓位
   */
  public async createPosition(params: CreatePositionParams): Promise<Position> {
    // 创建一个标准的Position对象
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
      sellTokenMint: params.sellTokenMint,
      sellTokenSymbol: params.sellTokenSymbol,
      sellTokenAmount: typeof params.sellTokenAmount === 'string' && params.sellTokenAmount
        ? new BN(params.sellTokenAmount)
        : params.sellTokenAmount as BN | undefined,
      buyTokenMint: params.buyTokenMint,
      buyTokenSymbol: params.buyTokenSymbol,
      expectedBuyAmount: typeof params.expectedBuyAmount === 'string' && params.expectedBuyAmount
        ? new BN(params.expectedBuyAmount)
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

    // 保存到数据库
    await this.savePosition(position);
    return position;
  }

  /**
   * 保存仓位到数据库
   */
  public async savePosition(position: Position): Promise<void> {
    let tokenPairId = position.tokenPair.id;
    let positionLastStatusId: string | null = null;

    // 如果代币对没有ID，先创建或查找代币对
    if (!tokenPairId) {
      const tokenPair = await prisma.tokenPair.upsert({
        where: {
          id: position.tokenPair.id || '',
        },
        update: {
          tokenASymbol: position.tokenPair.tokenASymbol,
          tokenBSymbol: position.tokenPair.tokenBSymbol,
          tokenAMint: position.tokenPair.tokenAMint,
          tokenBMint: position.tokenPair.tokenBMint,
          tokenADecimals: position.tokenPair.tokenADecimals,
          tokenBDecimals: position.tokenPair.tokenBDecimals,
        },
        create: {
          tokenASymbol: position.tokenPair.tokenASymbol,
          tokenBSymbol: position.tokenPair.tokenBSymbol,
          tokenAMint: position.tokenPair.tokenAMint,
          tokenBMint: position.tokenPair.tokenBMint,
          tokenADecimals: position.tokenPair.tokenADecimals,
          tokenBDecimals: position.tokenPair.tokenBDecimals,
        },
      });
      tokenPairId = tokenPair.id;
    }

    // 如果有lastStatus，先保存它
    if (position.lastStatus) {
      // 构建lastStatus数据创建
      const lastStatusData = {
        activeBin: position.lastStatus.activeBin,
        currentPrice: position.lastStatus.currentPrice,
        binInRange: position.lastStatus.binInRange,
        timestamp: position.lastStatus.timestamp,
        currentLowerPrice: position.lastStatus.currentLowerPrice,
        currentUpperPrice: position.lastStatus.currentUpperPrice,
        liquidityX: position.lastStatus.liquidityX,
        liquidityY: position.lastStatus.liquidityY,
        pendingFeesX: position.lastStatus.fees?.pendingFeesX.toString(),
        pendingFeesY: position.lastStatus.fees?.pendingFeesY.toString(),
        totalClaimedFeesX: position.lastStatus.fees?.totalClaimedFeesX.toString(),
        totalClaimedFeesY: position.lastStatus.fees?.totalClaimedFeesY.toString(),
        rewardOne: position.lastStatus.rewards?.rewardOne.toString(),
        rewardTwo: position.lastStatus.rewards?.rewardTwo.toString(),
        lastUpdatedAt: position.lastStatus.lastUpdatedAt,
      };

      // 创建新的lastStatus记录
      const lastStatus = await prisma.positionLastStatus.create({
        data: lastStatusData,
      });
      positionLastStatusId = lastStatus.id;
    }

    // 创建或更新仓位记录
    const commonPositionData = {
      poolAddress: position.poolAddress,
      lowerBinId: position.lowerBinId,
      upperBinId: position.upperBinId,
      initialLiquidityA: position.initialLiquidityA.toString(),
      initialLiquidityB: position.initialLiquidityB.toString(),
      lowerPriceLimit: position.lowerPriceLimit,
      upperPriceLimit: position.upperPriceLimit,
      sellTokenMint: position.sellTokenMint,
      sellTokenSymbol: position.sellTokenSymbol,
      sellTokenAmount: position.sellTokenAmount?.toString(),
      buyTokenMint: position.buyTokenMint,
      buyTokenSymbol: position.buyTokenSymbol,
      expectedBuyAmount: position.expectedBuyAmount?.toString(),
      actualBuyAmount: position.actualBuyAmount?.toString(),
      entryPrice: position.entryPrice,
      updatedAt: position.updatedAt,
      closedAt: position.closedAt,
      userWallet: position.userWallet,
      chatId: position.chatId,
      positionNFT: position.positionNFT,
      fee: position.fee,
      notes: position.notes,
      tokenPairId: tokenPairId,
      lastStatusId: positionLastStatusId,
    };

    await prisma.position.upsert({
      where: {
        id: position.id,
      },
      update: {
        ...commonPositionData,
        status: position.status as any
      },
      create: {
        id: position.id,
        ...commonPositionData,
        createdAt: position.createdAt,
        status: position.status as any
      },
    });
  }

  /**
   * 根据ID获取仓位
   */
  public async getPosition(id: string): Promise<Position | null> {
    const dbPosition = await prisma.position.findUnique({
      where: { id },
      include: {
        tokenPair: true,
        lastStatus: true,
      },
    });

    if (!dbPosition) {
      return null;
    }

    return this.convertDbToPosition(
      dbPosition,
      dbPosition.tokenPair,
      dbPosition.lastStatus
    );
  }

  /**
   * 获取所有仓位
   */
  public async getAllPositions(): Promise<Position[]> {
    const dbPositions = await prisma.position.findMany({
      include: {
        tokenPair: true,
        lastStatus: true,
      },
    });

    return dbPositions.map(dbPosition => 
      this.convertDbToPosition(
        dbPosition,
        dbPosition.tokenPair,
        dbPosition.lastStatus
      )
    );
  }

  /**
   * 获取用户的所有仓位
   */
  public async getPositionsByUser(userWallet: string): Promise<Position[]> {
    const dbPositions = await prisma.position.findMany({
      where: { userWallet },
      include: {
        tokenPair: true,
        lastStatus: true,
      },
    });

    return dbPositions.map(dbPosition => 
      this.convertDbToPosition(
        dbPosition,
        dbPosition.tokenPair,
        dbPosition.lastStatus
      )
    );
  }

  /**
   * 更新仓位
   */
  public async updatePosition(id: string, updates: Partial<Position>): Promise<void> {
    const position = await this.getPosition(id);
    if (!position) {
      throw new Error(`Position with ID ${id} not found`);
    }

    // 合并更新
    const updatedPosition: Position = {
      ...position,
      ...updates,
      updatedAt: new Date(), // 更新时间戳
    };

    // 保存更新后的仓位
    await this.savePosition(updatedPosition);
  }

  /**
   * 删除仓位
   */
  public async deletePosition(id: string): Promise<void> {
    // 删除相关的历史记录
    await prisma.positionHistory.deleteMany({
      where: { positionId: id },
    });

    // 获取仓位信息以获取lastStatusId
    const position = await prisma.position.findUnique({
      where: { id },
      select: { lastStatusId: true }
    });

    // 删除仓位
    await prisma.position.delete({
      where: { id },
    });

    // 如果存在lastStatus，也删除它
    if (position?.lastStatusId) {
      await prisma.positionLastStatus.delete({
        where: { id: position.lastStatusId },
      });
    }
  }

  /**
   * 保存仓位历史记录
   */
  public async savePositionHistory(history: PositionHistory): Promise<void> {
    await prisma.positionHistory.create({
      data: {
        id: history.id || uuidv4(),
        positionId: history.positionId,
        timestamp: history.timestamp,
        eventType: history.eventType,
        liquidityA: history.liquidityA?.toString(),
        liquidityB: history.liquidityB?.toString(),
        valueUSD: history.valueUSD,
        priceAtEvent: history.priceAtEvent,
        metadataJson: history.metadata ? JSON.stringify(history.metadata) : undefined,
      },
    });
  }

  /**
   * 获取仓位的历史记录
   */
  public async getPositionHistory(positionId: string): Promise<PositionHistory[]> {
    const dbHistories = await prisma.positionHistory.findMany({
      where: { positionId },
      orderBy: { timestamp: 'asc' },
    });

    return dbHistories.map(this.convertDbToPositionHistory);
  }
} 