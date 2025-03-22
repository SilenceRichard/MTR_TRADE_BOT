import { PositionMonitor } from '../../src/utils/positionMonitor';
import { Position, PositionStatus } from '../../models/Position';
import { FilePositionStorage } from '../../models/PositionStore';
import taskScheduler from '../../src/utils/scheduler';

// 模拟依赖
jest.mock('../../models/PositionStore');
jest.mock('../../models/UserWalletMap');
jest.mock('../../src/utils/scheduler');

// 模拟@solana/web3.js
jest.mock('@solana/web3.js', () => {
  return {
    Connection: jest.fn().mockImplementation(() => ({})),
    PublicKey: jest.fn().mockImplementation((key) => ({
      toString: () => key,
      toBuffer: jest.fn(),
      equals: jest.fn()
    }))
  };
});

// 模拟@meteora-ag/dlmm
jest.mock('@meteora-ag/dlmm', () => {
  return {
    __esModule: true,
    default: {
      create: jest.fn().mockResolvedValue({
        getPositionsByUserAndLbPair: jest.fn().mockResolvedValue({
          userPositions: []
        })
      })
    }
  };
});

// 模拟API方法
jest.mock('../../src/api/DLMM', () => ({
  getActiveBin: jest.fn().mockResolvedValue({
    binId: 150,
    pricePerToken: '22.5'
  }),
  getBinsBetweenLowerAndUpperBound: jest.fn().mockResolvedValue({
    bins: [
      { binId: 100, pricePerToken: '20.0' },
      { binId: 150, pricePerToken: '22.5' },
      { binId: 200, pricePerToken: '25.0' }
    ]
  })
}));

describe('PositionMonitor', () => {
  let positionMonitor: PositionMonitor;
  let mockTelegramBot: any;
  
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
    
    // 创建模拟的Telegram机器人
    mockTelegramBot = {
      sendMessage: jest.fn()
    };
    
    // 初始化PositionMonitor实例
    positionMonitor = new PositionMonitor(mockTelegramBot);
    
    // 模拟taskScheduler.registerTask方法
    (taskScheduler.registerTask as jest.Mock).mockReturnValue('test-task-id');
  });
  
  describe('startMonitoring', () => {
    it('应该注册一个任务并启动调度器', () => {
      // 执行测试
      positionMonitor.startMonitoring();
      
      // 验证结果
      expect(taskScheduler.registerTask).toHaveBeenCalled();
      expect(taskScheduler.start).toHaveBeenCalled();
      expect(taskScheduler.log).toHaveBeenCalled();
    });
    
    it('应该使用提供的间隔时间', () => {
      // 设置自定义间隔时间
      const customInterval = 30000;
      
      // 执行测试
      positionMonitor.startMonitoring(customInterval);
      
      // 验证结果
      expect(taskScheduler.registerTask).toHaveBeenCalledWith(
        expect.objectContaining({
          interval: customInterval
        })
      );
    });
  });
  
  describe('stopMonitoring', () => {
    it('应该停止任务', () => {
      // 先启动监控
      positionMonitor.startMonitoring();
      
      // 然后停止
      positionMonitor.stopMonitoring();
      
      // 验证结果
      expect(taskScheduler.removeTask).toHaveBeenCalledWith('test-task-id');
    });
  });
  
  describe('checkAllActivePositions', () => {
    it('应该检查所有活跃仓位', async () => {
      // 模拟仓位存储
      const mockPositions = [
        { id: '1', status: PositionStatus.ACTIVE } as Position,
        { id: '2', status: PositionStatus.CLOSED } as Position,
        { id: '3', status: PositionStatus.ACTIVE } as Position
      ];
      
      // 模拟FilePositionStorage.getAllPositions方法
      (FilePositionStorage.prototype.getAllPositions as jest.Mock).mockResolvedValue(mockPositions);
      
      // 模拟checkPositionStatus方法
      positionMonitor.checkPositionStatus = jest.fn().mockResolvedValue(undefined);
      
      // 执行测试
      await positionMonitor.checkAllActivePositions();
      
      // 验证结果
      expect(positionMonitor.checkPositionStatus).toHaveBeenCalledTimes(2);
      expect(positionMonitor.checkPositionStatus).toHaveBeenCalledWith(mockPositions[0]);
      expect(positionMonitor.checkPositionStatus).toHaveBeenCalledWith(mockPositions[2]);
    });
    
    it('应该处理检查过程中的错误', async () => {
      // 模拟仓位存储出错
      (FilePositionStorage.prototype.getAllPositions as jest.Mock).mockRejectedValue(new Error('Test error'));
      
      // 执行测试并验证是否抛出错误
      await expect(positionMonitor.checkAllActivePositions()).rejects.toThrow('Test error');
      
      // 验证日志
      expect(taskScheduler.log).toHaveBeenCalledWith(
        expect.anything(),
        'Error checking active positions',
        expect.objectContaining({ error: 'Test error' })
      );
    });
  });
}); 