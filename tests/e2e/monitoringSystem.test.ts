/**
 * 仓位监控系统端到端测试
 * 
 * 注意：这些测试默认被跳过（xdescribe），因为它们涉及实际网络连接
 * 如果需要运行，请将xdescribe改为describe，并确保有合适的测试环境
 */

import { PositionMonitor } from '../../src/utils/positionMonitor';
import { Position, PositionStatus } from '../../models/Position';
import { FilePositionStorage } from '../../models/PositionStore';
import { FileUserWalletMapStorage } from '../../models/UserWalletMap';
import TelegramBot from 'node-telegram-bot-api';

// 使用xdescribe标记为跳过的测试组
xdescribe('Position Monitoring System E2E Tests', () => {
  let positionMonitor: PositionMonitor;
  let mockTelegramBot: any;
  
  beforeEach(() => {
    // 创建模拟的Telegram机器人
    mockTelegramBot = {
      sendMessage: jest.fn().mockResolvedValue(undefined)
    };
    
    // 初始化PositionMonitor实例
    positionMonitor = new PositionMonitor(mockTelegramBot);
  });
  
  afterEach(() => {
    // 确保每次测试后都停止监控
    positionMonitor.stopMonitoring();
  });
  
  it('应该能启动监控系统并处理活跃仓位', async () => {
    // 启动监控
    positionMonitor.startMonitoring(30000); // 30秒的监控间隔
    
    // 等待一段时间让监控系统运行
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 手动触发一次检查
    await positionMonitor.checkAllActivePositions();
    
    // 验证系统是否正常运行（在实际测试中可以检查日志或存储）
    
    // 停止监控
    positionMonitor.stopMonitoring();
  });
  
  it('应该能定期检查仓位状态', async () => {
    // 这个测试需要较长时间运行
    jest.setTimeout(120000); // 设置较长的超时时间
    
    // 启动监控，设置较短的间隔以便测试
    positionMonitor.startMonitoring(5000); // 5秒的监控间隔
    
    // 等待足够时间，让系统执行多次检查
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // 停止监控
    positionMonitor.stopMonitoring();
    
    // 在实际测试中可以检查是否多次调用了检查方法
  });
  
  // 仅当实际集成测试时才启用此测试
  it.skip('应该能连接到真实的Telegram API', async () => {
    // 需要有效的Telegram Bot Token
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.warn('跳过Telegram API测试：未提供TELEGRAM_BOT_TOKEN环境变量');
      return;
    }
    
    // 创建实际的Telegram Bot实例
    const realBot = new TelegramBot(botToken, { polling: false });
    
    // 使用实际的bot创建监控器
    const realMonitor = new PositionMonitor(realBot);
    
    try {
      // 启动监控
      realMonitor.startMonitoring(60000);
      
      // 等待一会儿
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 停止监控
      realMonitor.stopMonitoring();
    } catch (error) {
      console.error('Telegram API测试失败', error);
      throw error;
    }
  });
}); 