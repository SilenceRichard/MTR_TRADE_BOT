import { PositionMonitor } from '../../src/utils/positionMonitor';
import { Position, PositionStatus } from '../../models/Position';
import { FilePositionStorage } from '../../models/PositionStore';
import taskScheduler, { LogLevel } from '../../src/utils/scheduler';
import DLMM from '@meteora-ag/dlmm';
import { Connection, PublicKey } from '@solana/web3.js';

// 模拟依赖
jest.mock('../../models/PositionStore');
jest.mock('../../models/UserWalletMap');
jest.mock('../../src/utils/scheduler');
jest.mock('@solana/web3.js');
jest.mock('@meteora-ag/dlmm');
jest.mock('../../src/api/DLMM', () => ({
  getActiveBin: jest.fn(),
  getBinsBetweenLowerAndUpperBound: jest.fn()
}));

// 导入模拟的API
import { getActiveBin, getBinsBetweenLowerAndUpperBound } from '../../src/api/DLMM';

describe('Position Status Monitoring', () => {
  let positionMonitor: PositionMonitor;
  let mockTelegramBot: any;
  let mockPosition: Position;
  
  beforeEach(() => {
    // 重置所有模拟
    jest.clearAllMocks();
    
    // 创建模拟的Telegram机器人
    mockTelegramBot = {
      sendMessage: jest.fn().mockResolvedValue(undefined)
    };
    
    // 初始化PositionMonitor实例
    positionMonitor = new PositionMonitor(mockTelegramBot);
    
    // 创建模拟仓位数据 - 确保包含chatId
    mockPosition = {
      id: 'test-position-1',
      status: PositionStatus.ACTIVE,
      userWallet: 'test-wallet-address',
      poolAddress: 'test-pool-address',
      tokenPair: {
        tokenASymbol: 'SOL',
        tokenBSymbol: 'USDC',
        tokenAMint: 'sol-mint',
        tokenBMint: 'usdc-mint'
      },
      lowerBinId: 100,
      upperBinId: 200,
      lowerPriceLimit: 20.0,
      upperPriceLimit: 25.0,
      createdAt: new Date(),
      sellTokenMint: 'sol-mint',
      buyTokenMint: 'usdc-mint',
      sellTokenSymbol: 'SOL',
      buyTokenSymbol: 'USDC',
      chatId: 12345  // 确保这里有chatId，这样测试通知时不需要依赖getChatIdForWallet
    } as Position;
    
    // 模拟Connection
    (Connection as jest.Mock).mockImplementation(() => ({
      // 添加需要模拟的方法
    }));
    
    // 模拟DLMM.create
    (DLMM.create as jest.Mock).mockResolvedValue({
      getPositionsByUserAndLbPair: jest.fn().mockResolvedValue({
        userPositions: [
          {
            positionData: {
              lowerBinId: 100,
              upperBinId: 200,
              totalXAmount: '1000000',
              totalYAmount: '20000000',
              feeX: '5000',
              feeY: '10000',
              totalClaimedFeeXAmount: '1000',
              totalClaimedFeeYAmount: '2000',
              lastUpdatedAt: {
                toNumber: () => Date.now() / 1000
              },
              rewardOne: '500',
              rewardTwo: '1000'
            }
          }
        ]
      })
    });
    
    // 模拟getActiveBin
    (getActiveBin as jest.Mock).mockResolvedValue({
      binId: 150,  // 仓位范围内的活跃bin
      pricePerToken: '22.5'  // 价格在仓位范围内
    });
    
    // 模拟getBinsBetweenLowerAndUpperBound
    (getBinsBetweenLowerAndUpperBound as jest.Mock).mockResolvedValue({
      bins: [
        { binId: 100, pricePerToken: '20.0' },
        { binId: 150, pricePerToken: '22.5' },
        { binId: 200, pricePerToken: '25.0' }
      ]
    });
    
    // 模拟FilePositionStorage
    (FilePositionStorage.prototype.updatePosition as jest.Mock).mockResolvedValue(undefined);
    (FilePositionStorage.prototype.savePositionHistory as jest.Mock).mockResolvedValue(undefined);
  });
  
  describe('checkPositionStatus', () => {
    it('应该正确检查仓位状态并更新', async () => {
      // 执行测试
      await positionMonitor.checkPositionStatus(mockPosition);
      
      // 验证结果
      // 1. 应该调用DLMM.create
      expect(DLMM.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(PublicKey),
        expect.objectContaining({ cluster: 'mainnet-beta' })
      );
      
      // 2. 应该调用getActiveBin
      expect(getActiveBin).toHaveBeenCalled();
      
      // 3. 应该获取链上仓位数据
      expect(taskScheduler.log).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('Retrieved on-chain position data'),
        expect.anything()
      );
      
      // 4. 应该更新仓位历史
      expect(FilePositionStorage.prototype.savePositionHistory).toHaveBeenCalled();
      
      // 5. 应该更新仓位状态
      expect(FilePositionStorage.prototype.updatePosition).toHaveBeenCalledWith(
        'test-position-1',
        expect.objectContaining({
          lastStatus: expect.objectContaining({
            binInRange: true,
            currentPrice: 22.5
          })
        })
      );
    });
    
    it('应该在仓位状态变化时发送通知', async () => {
      // 修改模拟以测试通知
      // 假设仓位之前没有lastStatus
      mockPosition.lastStatus = undefined;
      
      // 执行测试
      await positionMonitor.checkPositionStatus(mockPosition);
      
      // 验证结果 - 应该发送通知
      expect(mockTelegramBot.sendMessage).toHaveBeenCalledWith(
        12345,  // chatId
        expect.stringContaining('New position is now being monitored'),
        expect.anything()
      );
    });
    
    it('应该在活跃bin移出范围时发送通知', async () => {
      // 模拟之前的状态
      mockPosition.lastStatus = {
        activeBin: 150,
        binInRange: true,
        currentPrice: 22.5,
        timestamp: new Date(Date.now() - 60000)  // 1分钟前
      };
      
      // 将活跃bin改为范围外
      (getActiveBin as jest.Mock).mockResolvedValue({
        binId: 250,  // 超出仓位范围
        pricePerToken: '30.0'  // 超出价格范围
      });
      
      // 执行测试
      await positionMonitor.checkPositionStatus(mockPosition);
      
      // 验证结果 - 应该发送通知
      expect(mockTelegramBot.sendMessage).toHaveBeenCalledWith(
        12345,  // chatId
        expect.stringContaining('Position has moved out of range'),
        expect.anything()
      );
    });
    
    it('应该在价格显著变化时发送通知', async () => {
      // 模拟之前的状态
      mockPosition.lastStatus = {
        activeBin: 150,
        binInRange: true,
        currentPrice: 22.5,
        timestamp: new Date(Date.now() - 60000)  // 1分钟前
      };
      
      // 将价格改为显著变化
      (getActiveBin as jest.Mock).mockResolvedValue({
        binId: 180,  // 仍在范围内
        pricePerToken: '24.0'  // 价格显著变化
      });
      
      // 模拟价格变化的设置
      (mockPosition as any).significantPriceChange = 0.05;  // 5%的变化被认为是显著的
      
      // 执行测试
      await positionMonitor.checkPositionStatus(mockPosition);
      
      // 验证结果 - 应该发送通知
      expect(mockTelegramBot.sendMessage).toHaveBeenCalledWith(
        12345,  // chatId
        expect.stringContaining('Price has changed significantly'),
        expect.anything()
      );
    });
  });
}); 