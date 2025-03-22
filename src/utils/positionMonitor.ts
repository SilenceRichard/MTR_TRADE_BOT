import DLMM from '@meteora-ag/dlmm';
import { Connection, PublicKey } from '@solana/web3.js';
import { RPC } from '../config';
import { FilePositionStorage } from '../../models/PositionStore';
import { Position, PositionStatus } from '../../models/Position';
import taskScheduler, { LogLevel, ScheduledTask } from './scheduler';
import BN from 'bn.js';
import { getActiveBin, getBinsBetweenLowerAndUpperBound } from '../api/DLMM';
import { FileUserWalletMapStorage } from '../../models/UserWalletMap';

// 仓位监控器类
export class PositionMonitor {
  private connection: Connection;
  private positionStorage: FilePositionStorage;
  private monitorTaskId?: string;
  private monitorInterval: number = 10 * 1000; // 默认10秒检查一次
  public telegramBot?: any; // Telegram机器人实例，用于发送通知
  private userWalletMapStorage: FileUserWalletMapStorage;

  constructor(telegramBot?: any) {
    this.connection = new Connection(RPC, 'confirmed');
    this.positionStorage = new FilePositionStorage();
    this.userWalletMapStorage = new FileUserWalletMapStorage();
    this.telegramBot = telegramBot;
  }

  /**
   * 开始监控所有活跃仓位
   */
  public startMonitoring(interval?: number): void {
    // 如果提供了间隔，更新监控间隔
    if (interval) {
      this.monitorInterval = interval;
    }

    // 如果已经有监控任务在运行，先停止它
    if (this.monitorTaskId) {
      this.stopMonitoring();
    }

    // 注册监控任务
    this.monitorTaskId = taskScheduler.registerTask({
      name: 'Position Status Monitor',
      interval: this.monitorInterval,
      enabled: true,
      fn: () => this.checkAllActivePositions(),
      maxRetries: 3,
      retryDelay: 30000, // 30秒后重试
      timeout: 2 * 60 * 1000, // 2分钟超时
      retryAttempts: 0 // 添加缺少的retryAttempts属性
    });

    // 启动调度器
    taskScheduler.start();
    
    taskScheduler.log(LogLevel.INFO, 'Position monitoring started', { 
      interval: this.monitorInterval,
      taskId: this.monitorTaskId
    });
  }

  /**
   * 停止监控
   */
  public stopMonitoring(): void {
    if (this.monitorTaskId) {
      taskScheduler.removeTask(this.monitorTaskId);
      this.monitorTaskId = undefined;
      
      taskScheduler.log(LogLevel.INFO, 'Position monitoring stopped');
    }
  }

  /**
   * 更新监控间隔
   */
  public updateMonitorInterval(interval: number): void {
    this.monitorInterval = interval;
    
    if (this.monitorTaskId) {
      taskScheduler.updateTask(this.monitorTaskId, { interval });
      
      taskScheduler.log(LogLevel.INFO, 'Monitor interval updated', { 
        newInterval: interval,
        taskId: this.monitorTaskId
      });
    }
  }

  /**
   * 检查所有活跃仓位的状态
   */
  public async checkAllActivePositions(): Promise<void> {
    try {
      // 获取所有活跃仓位
      const positions = await this.positionStorage.getAllPositions();
      const activePositions = positions.filter(p => p.status === PositionStatus.ACTIVE);
      
      taskScheduler.log(LogLevel.INFO, 'Checking active positions', { 
        totalPositions: positions.length,
        activePositions: activePositions.length 
      });

      // 并行检查所有活跃仓位
      const checkPromises = activePositions.map(position => this.checkPositionStatus(position));
      await Promise.all(checkPromises);
      
      taskScheduler.log(LogLevel.INFO, 'All position checks completed');
      
      return;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      taskScheduler.log(LogLevel.ERROR, 'Error checking active positions', { error: errorMsg });
      throw error;
    }
  }

  /**
   * 检查单个仓位的状态
   */
  public async checkPositionStatus(position: Position): Promise<void> {
    try {
      taskScheduler.log(LogLevel.INFO, `Checking position status`, { positionId: position.id });
      
      const status = await this.fetchPositionStatus(position);
      
      // 记录状态更新
      await this.savePositionStatus(position, status);
      
      // 检查是否有需要发送通知的情况
      await this.checkForNotifications(position, status);
      
      return;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      taskScheduler.log(LogLevel.ERROR, `Error checking position: ${position.id}`, { error: errorMsg });
      throw error;
    }
  }

  /**
   * 获取仓位当前状态
   */
  private async fetchPositionStatus(position: Position): Promise<any> {
    // 连接到DLMM池
    const dlmmPool = await DLMM.create(
      this.connection, 
      new PublicKey(position.poolAddress),
      { cluster: 'mainnet-beta' }
    );
    
    // 获取当前活跃bin
    const activeBin = await getActiveBin(dlmmPool);
    const activeBinId = activeBin.binId;
    const currentPrice = Number(activeBin.pricePerToken);
    
    // 判断当前仓位的bin范围与活跃bin的关系
    const binInRange = activeBinId >= position.lowerBinId && activeBinId <= position.upperBinId;
    
    try {
      // 获取位置数据
      // 使用DLMM.getPositionsByUserAndLbPair获取链上仓位状态信息
      const userWallet = new PublicKey(position.userWallet);
      const result = await dlmmPool.getPositionsByUserAndLbPair(userWallet);
      const userPositions = result.userPositions || [];
      
      // 变量初始化
      let positionData = null;
      let liquidityX = null;
      let liquidityY = null;
      let fees = null;
      
      // 在用户的仓位中查找匹配当前仓位bin范围的仓位
      if (userPositions && userPositions.length > 0) {
        for (const pos of userPositions) {
          if (pos.positionData && 
              pos.positionData.lowerBinId === position.lowerBinId && 
              pos.positionData.upperBinId === position.upperBinId) {
            positionData = pos;
            
            // 获取流动性信息
            liquidityX = pos.positionData.totalXAmount;
            liquidityY = pos.positionData.totalYAmount;
            
            // 获取手续费信息
            fees = {
              pendingFeesX: pos.positionData.feeX,
              pendingFeesY: pos.positionData.feeY,
              totalClaimedFeesX: pos.positionData.totalClaimedFeeXAmount,
              totalClaimedFeesY: pos.positionData.totalClaimedFeeYAmount
            };
            
            // 记录链上仓位数据
            taskScheduler.log(LogLevel.INFO, `Retrieved on-chain position data for ${position.id}`, {
              positionId: position.id,
              binRange: `${pos.positionData.lowerBinId} - ${pos.positionData.upperBinId}`,
              lastUpdatedAt: pos.positionData.lastUpdatedAt.toString()
            });
            
            break; // 找到匹配的仓位后退出循环
          }
        }
      }
      
      if (!positionData) {
        taskScheduler.log(LogLevel.WARNING, `No matching on-chain position found for position ${position.id}`, {
          userWallet: position.userWallet,
          lowerBinId: position.lowerBinId,
          upperBinId: position.upperBinId
        });
      }
      
      // 获取bin范围内的信息
      const sellingX = position.sellTokenMint === position.tokenPair.tokenAMint;
      const rangeBins = await getBinsBetweenLowerAndUpperBound({
        dlmmPool,
        actBin: activeBin,
        sellingX
      });
      
      // 获取当前的价格范围信息
      const currentLowerPrice = Number(rangeBins.bins[0]?.pricePerToken) || 0;
      const currentUpperPrice = Number(rangeBins.bins[rangeBins.bins.length - 1]?.pricePerToken) || 0;
      
      // 计算用户仓位价格范围是否变化
      const priceRangeChanged = 
        Math.abs(currentLowerPrice - position.lowerPriceLimit) > 0.0001 || 
        Math.abs(currentUpperPrice - position.upperPriceLimit) > 0.0001;
      
      return {
        activeBin: activeBinId,
        binInRange,
        currentPrice,
        timestamp: new Date(),
        rangeBins: rangeBins.bins.length > 0 ? rangeBins.bins : null,
        currentLowerPrice,
        currentUpperPrice,
        priceRangeChanged,
        // 添加链上数据
        onChainPosition: positionData,
        liquidityX,
        liquidityY,
        fees,
        // 添加额外的链上数据
        lastUpdatedAt: positionData?.positionData?.lastUpdatedAt,
        positionBinData: positionData?.positionData?.positionBinData,
        rewards: positionData?.positionData ? {
          rewardOne: positionData.positionData.rewardOne,
          rewardTwo: positionData.positionData.rewardTwo
        } : null
      };
    } catch (error) {
      // 如果获取范围bins失败，仍然返回基本信息
      return {
        activeBin: activeBinId,
        binInRange,
        currentPrice,
        timestamp: new Date(),
        error: String(error)
      };
    }
  }
  
  /**
   * 保存仓位状态更新
   */
  private async savePositionStatus(position: Position, status: any): Promise<void> {
    // 创建历史记录
    const historyMetadata: Record<string, any> = {
      activeBin: status.activeBin,
      binInRange: status.binInRange,
      currentLowerPrice: status.currentLowerPrice,
      currentUpperPrice: status.currentUpperPrice
    };
    
    // 如果有链上数据，添加到历史记录中
    if (status.onChainPosition) {
      historyMetadata.onChainData = {
        liquidityX: status.liquidityX,
        liquidityY: status.liquidityY,
        fees: status.fees,
        rewards: status.rewards,
        lastUpdatedAt: status.lastUpdatedAt ? status.lastUpdatedAt.toString() : null,
        positionBinData: status.positionBinData
      };
    }
    
    await this.positionStorage.savePositionHistory({
      id: `history_${Date.now()}`,
      positionId: position.id,
      timestamp: new Date(),
      eventType: 'status_check',
      priceAtEvent: status.currentPrice,
      liquidityA: status.liquidityX ? new BN(status.liquidityX) : undefined,
      liquidityB: status.liquidityY ? new BN(status.liquidityY) : undefined,
      metadata: historyMetadata
    });
    
    // 更新仓位的lastStatus信息
    const updates: Partial<Position> = {
      lastStatus: {
        activeBin: status.activeBin,
        currentPrice: status.currentPrice,
        binInRange: status.binInRange,
        timestamp: new Date(),
        currentLowerPrice: status.currentLowerPrice,
        currentUpperPrice: status.currentUpperPrice,
        // 添加链上数据到lastStatus
        liquidityX: status.liquidityX,
        liquidityY: status.liquidityY,
        fees: status.fees,
        rewards: status.rewards,
        lastUpdatedAt: status.lastUpdatedAt ? status.lastUpdatedAt.toString() : null
      }
    };
    
    await this.positionStorage.updatePosition(position.id, updates);
  }
  
  /**
   * 检查是否需要发送通知
   */
  private async checkForNotifications(position: Position, status: any): Promise<void> {
    // 如果没有配置通知机器人，跳过
    if (!this.telegramBot) {
      taskScheduler.log(LogLevel.INFO, `Skipping notification check: No telegram bot configured`);
      return;
    }
    
    // 获取该钱包对应的Telegram Chat ID
    const userWallet = position.userWallet;
    const chatId = await this.getChatIdForWallet(userWallet);
    
    if (!chatId) {
      taskScheduler.log(LogLevel.INFO, `Cannot send notification: No chat ID found for wallet ${userWallet}`);
      return;
    }
    
    try {
      // 构建基本消息内容
      let message = `📊 *Position Update* #${position.id}\n\n`;
      message += `*Pair*: ${position.tokenPair.tokenASymbol}/${position.tokenPair.tokenBSymbol}\n`;
      message += `*Current Price*: ${status.currentPrice.toFixed(4)} ${position.tokenPair.tokenBSymbol}/${position.tokenPair.tokenASymbol}\n`;
      
      // 添加价格范围信息
      if (position.lowerPriceLimit && position.upperPriceLimit) {
        message += `*Your Price Range*: ${position.lowerPriceLimit.toFixed(4)} - ${position.upperPriceLimit.toFixed(4)}\n`;
      }
      
      // 如果有当前价格范围，也显示出来
      if (status.currentLowerPrice && status.currentUpperPrice) {
        message += `*Current Market Range*: ${status.currentLowerPrice.toFixed(4)} - ${status.currentUpperPrice.toFixed(4)}\n`;
      }
      
      message += `*In Range*: ${status.binInRange ? '✅' : '❌'}\n\n`;
      
      // 如果有链上仓位数据，添加到消息中
      if (status.liquidityX || status.liquidityY) {
        message += `*Current Liquidity*:\n`;
        if (status.liquidityX) {
          message += `${position.tokenPair.tokenASymbol}: ${status.liquidityX}\n`;
        }
        if (status.liquidityY) {
          message += `${position.tokenPair.tokenBSymbol}: ${status.liquidityY}\n`;
        }
        message += `\n`;
      }
      
      // 如果有手续费信息，添加到消息中
      if (status.fees) {
        message += `*Fees*:\n`;
        if (status.fees.pendingFeesX) {
          message += `Pending ${position.tokenPair.tokenASymbol}: ${status.fees.pendingFeesX.toString()}\n`;
        }
        if (status.fees.pendingFeesY) {
          message += `Pending ${position.tokenPair.tokenBSymbol}: ${status.fees.pendingFeesY.toString()}\n`;
        }
        if (status.fees.totalClaimedFeesX) {
          message += `Total Claimed ${position.tokenPair.tokenASymbol}: ${status.fees.totalClaimedFeesX.toString()}\n`;
        }
        if (status.fees.totalClaimedFeesY) {
          message += `Total Claimed ${position.tokenPair.tokenBSymbol}: ${status.fees.totalClaimedFeesY.toString()}\n`;
        }
        message += `\n`;
      }
      
      // 如果有奖励信息，添加到消息中
      if (status.rewards) {
        message += `*Rewards*:\n`;
        if (status.rewards.rewardOne) {
          message += `Reward One: ${status.rewards.rewardOne.toString()}\n`;
        }
        if (status.rewards.rewardTwo) {
          message += `Reward Two: ${status.rewards.rewardTwo.toString()}\n`;
        }
        message += `\n`;
      }
      
      // 如果有最后更新时间，添加到消息中
      if (status.lastUpdatedAt) {
        const lastUpdateTime = new Date(status.lastUpdatedAt.toNumber() * 1000);
        message += `*Last Updated*: ${lastUpdateTime.toLocaleString()}\n\n`;
      }
      
      // 是否需要发送通知的条件判断
      let shouldNotify = false;
      
      // 检查各种可能需要通知的条件
      
      // 0. 新创建的仓位首次检查状态时立即发送通知
      if (!position.lastStatus) {
        message += `✅ *New position is now being monitored*\n\n`;
        shouldNotify = true;
      }
      
      // 1. 价格范围变化超过阈值
      if (status.priceRangeChanged) {
        message += `⚠️ *Price range has changed significantly*\n\n`;
        shouldNotify = true;
      }
      
      // 2. 状态切换 (在范围内 <-> 在范围外)
      const previouslyInRange = position.lastStatus?.binInRange;
      if (previouslyInRange !== undefined && previouslyInRange !== status.binInRange) {
        if (status.binInRange) {
          message += `✅ *Position is now in range*\n\n`;
        } else {
          message += `⚠️ *Position is now out of range*\n\n`;
        }
        shouldNotify = true;
      }
      
      // 3. 如果链上数据显示流动性或手续费有变化，也通知
      if (status.onChainPosition && position.lastStatus) {
        const lastStatus = position.lastStatus as any;
        let changes = [];
        
        // 检查流动性变化
        if (lastStatus.liquidityX !== status.liquidityX || lastStatus.liquidityY !== status.liquidityY) {
          changes.push('liquidity');
        }
        
        // 检查手续费变化
        if (status.fees && lastStatus.fees) {
          if (lastStatus.fees.pendingFeesX !== status.fees.pendingFeesX || 
              lastStatus.fees.pendingFeesY !== status.fees.pendingFeesY) {
            changes.push('pending fees');
          }
          if (lastStatus.fees.totalClaimedFeesX !== status.fees.totalClaimedFeesX || 
              lastStatus.fees.totalClaimedFeesY !== status.fees.totalClaimedFeesY) {
            changes.push('claimed fees');
          }
        }
        
        // 检查奖励变化
        if (status.rewards && lastStatus.rewards) {
          if (lastStatus.rewards.rewardOne !== status.rewards.rewardOne || 
              lastStatus.rewards.rewardTwo !== status.rewards.rewardTwo) {
            changes.push('rewards');
          }
        }
        
        if (changes.length > 0) {
          shouldNotify = true;
          message += `ℹ️ *On-chain updates detected*: ${changes.join(', ')}\n\n`;
        }
      }
      
      // 如果应该发送通知，则发送
      if (shouldNotify) {
        await this.telegramBot.sendMessage(chatId, message, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '查看详情', callback_data: `position_${position.id}` }]
            ]
          }
        });
        
        taskScheduler.log(LogLevel.INFO, `Sent notification about position ${position.id} to chat ${chatId}`);
      }
    } catch (error) {
      taskScheduler.log(LogLevel.ERROR, `Error sending notification: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * 获取钱包地址对应的Telegram Chat ID
   * 这个方法需要根据你的实际用户管理方式来实现
   */
  private async getChatIdForWallet(wallet: string): Promise<number | null> {
    try {
      // 从用户钱包映射中查找对应的Telegram用户ID
      const chatIds = await this.userWalletMapStorage.getChatIdsByWallet(wallet);
      if (chatIds && chatIds.length > 0) {
        return chatIds[0]; // 返回第一个找到的chatId
      }
      
      // 如果没有找到，尝试从仓位记录中获取chatId
      const positions = await this.positionStorage.getPositionsByUser(wallet);
      if (positions && positions.length > 0 && positions[0].chatId) {
        return positions[0].chatId;
      }
      
      // 记录未找到对应的chatId
      taskScheduler.log(LogLevel.INFO, `No chat ID found for wallet: ${wallet}`);
      return null;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      taskScheduler.log(LogLevel.ERROR, `Error getting chatId for wallet: ${wallet}`, { error: errorMsg });
      return null;
    }
  }
}

// 导出单例
export const positionMonitor = new PositionMonitor();
export default positionMonitor; 