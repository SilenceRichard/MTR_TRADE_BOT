import { PositionMonitor } from '../../src/utils/positionMonitor';
import { Position, PositionStatus } from '../../models/Position';
import { FilePositionStorage } from '../../models/PositionStore';
import taskScheduler from '../../src/utils/scheduler';

// 模拟部分依赖，但保留某些实际调用
jest.mock('@solana/web3.js', () => {
  return {
    Connection: jest.fn().mockImplementation(() => ({
      // 模拟必要方法
    })),
    PublicKey: jest.fn().mockImplementation((key) => {
      return {
        toString: () => key,
        toBuffer: () => Buffer.from(key),
        equals: (other: any) => key === other.toString()
      };
    })
  };
});

// 部分模拟，保留部分功能
jest.mock('../../src/utils/scheduler', () => {
  // 创建实际的调度器对象，但模拟某些方法
  const actual = jest.requireActual('../../src/utils/scheduler');
  return {
    ...actual,
    // 模拟方法
    start: jest.fn(),
    log: jest.fn(),
    registerTask: jest.fn().mockReturnValue('test-task-id'),
    removeTask: jest.fn()
  };
});

describe('Position Monitor Integration Tests', () => {
  let positionMonitor: PositionMonitor;
  let mockTelegramBot: any;
  let mockPosition: Position;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // 创建模拟的Telegram机器人
    mockTelegramBot = {
      sendMessage: jest.fn().mockResolvedValue(undefined)
    };
    
    // 初始化仓位监控器
    positionMonitor = new PositionMonitor(mockTelegramBot);
    
    // 创建测试仓位
    mockPosition = {
      id: 'integration-test-position-1',
      status: PositionStatus.ACTIVE,
      userWallet: '7nrKMWJeQj5TVTc4xuuS8PV4AuunFTFE9xyiJr2asSKr',
      poolAddress: 'HWQ4HVW5Np8NphPHbFPnnYgBmhZGo4VXob6NaAD3W3CZ',
      tokenPair: {
        tokenASymbol: 'SOL',
        tokenBSymbol: 'USDC',
        tokenAMint: 'So11111111111111111111111111111111111111112',
        tokenBMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
      },
      lowerBinId: 2960000,
      upperBinId: 3000000,
      lowerPriceLimit: 99.0,
      upperPriceLimit: 105.0,
      createdAt: new Date(),
      chatId: 12345
    } as Position;
    
    // 模拟仓位存储
    (FilePositionStorage.prototype.getAllPositions as jest.Mock) = jest.fn().mockResolvedValue([mockPosition]);
    (FilePositionStorage.prototype.updatePosition as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (FilePositionStorage.prototype.savePositionHistory as jest.Mock) = jest.fn().mockResolvedValue(undefined);
  });
  
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });
  
  describe('Monitor Lifecycle', () => {
    it('应该成功启动和停止监控', () => {
      // 启动监控
      positionMonitor.startMonitoring(30000);
      
      // 验证监控是否启动
      expect(taskScheduler.registerTask).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Position Status Monitor',
        interval: 30000,
        enabled: true
      }));
      expect(taskScheduler.start).toHaveBeenCalled();
      
      // 停止监控
      positionMonitor.stopMonitoring();
      
      // 验证是否成功停止
      expect(taskScheduler.removeTask).toHaveBeenCalledWith('test-task-id');
    });
    
    it('应该能够更新监控间隔', () => {
      // 启动监控
      positionMonitor.startMonitoring(10000);
      
      // 更新间隔
      positionMonitor.updateMonitorInterval(60000);
      
      // 验证是否更新间隔
      expect(taskScheduler.updateTask).toHaveBeenCalledWith('test-task-id', { interval: 60000 });
    });
  });
  
  describe('Integration with External Systems', () => {
    // 注意：这些测试可能会向Solana网络发出实际请求
    // 在CI环境中可能需要标记为跳过，或确保有合适的模拟
    
    it('应该处理超时和重试', async () => {
      // 模拟一个超时错误
      (FilePositionStorage.prototype.getAllPositions as jest.Mock).mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Connection timeout')), 1000);
        });
      });
      
      // 第二次尝试成功
      (FilePositionStorage.prototype.getAllPositions as jest.Mock).mockImplementationOnce(() => {
        return Promise.resolve([mockPosition]);
      });
      
      // 执行测试 - 启动监控
      positionMonitor.startMonitoring();
      
      // 等待第一次失败
      await jest.advanceTimersByTimeAsync(2000);
      
      // 验证是否有错误日志
      expect(taskScheduler.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Error checking active positions'),
        expect.objectContaining({ error: 'Connection timeout' })
      );
      
      // 验证重试机制
      // 这里需要更复杂的模拟来测试完整重试流程
    });
  });
}); 