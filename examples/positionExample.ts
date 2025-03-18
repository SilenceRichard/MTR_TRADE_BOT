import BN from 'bn.js';
import { Position, PositionStatus, TokenPair, CreatePositionParams } from '../models/Position';
import { FilePositionStorage } from '../models/PositionStore';

/**
 * 仓位数据模型使用示例
 */
async function main() {
  console.log('初始化仓位存储...');
  const positionStorage = new FilePositionStorage();
  
  // 创建示例代币对
  const solUsdcPair: TokenPair = {
    tokenASymbol: 'SOL',
    tokenBSymbol: 'USDC',
    tokenAMint: 'So11111111111111111111111111111111111111112',
    tokenBMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    tokenADecimals: 9,
    tokenBDecimals: 6
  };
  
  // 创建新仓位参数
  const createParams: CreatePositionParams = {
    poolAddress: '9uEazQxpRTyYX1hHtgTUmfMkRPGYi1NwzCmGCNxFZxvj', // 示例池地址
    tokenPair: solUsdcPair,
    lowerBinId: 8400,  // 示例下限bin ID
    upperBinId: 8600,  // 示例上限bin ID
    initialLiquidityA: new BN('500000000'), // 0.5 SOL
    initialLiquidityB: new BN('10000000'),  // 10 USDC
    userWallet: 'Aw1BMJMdxVJGYJrMa8d7PyAHzgysK9AQsVwcYBdnKm9e', // 示例用户钱包
    fee: 0.3, // 费率
    notes: '示例仓位 - SOL/USDC'
  };
  
  // 创建仓位
  console.log('创建示例仓位...');
  const position = positionStorage.createPosition(createParams);
  console.log(`已创建仓位ID: ${position.id}`);
  
  // 保存仓位
  await positionStorage.savePosition(position);
  console.log('仓位已保存到本地存储');
  
  // 查询所有仓位
  const allPositions = await positionStorage.getAllPositions();
  console.log(`总仓位数: ${allPositions.length}`);
  
  // 查询特定仓位
  const retrievedPosition = await positionStorage.getPosition(position.id);
  console.log('查询到的仓位详情:');
  console.log(JSON.stringify(retrievedPosition, (key, value) => {
    // 处理BN对象的序列化
    if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'BN') {
      return value.toString();
    }
    return value;
  }, 2));
  
  // 更新仓位
  if (retrievedPosition) {
    console.log('更新仓位信息...');
    await positionStorage.updatePosition(retrievedPosition.id, {
      notes: '已更新的仓位笔记 - SOL/USDC长期持有',
    });
    
    // 获取更新后的仓位
    const updatedPosition = await positionStorage.getPosition(position.id);
    console.log('更新后的仓位笔记:', updatedPosition?.notes);
  }
  
  // 获取仓位历史
  const history = await positionStorage.getPositionHistory(position.id);
  console.log(`仓位历史记录数: ${history.length}`);
  console.log('历史事件类型:', history.map(h => h.eventType));
  
  console.log('示例完成');
}

// 运行示例
main().catch(error => {
  console.error('示例运行出错:', error);
}); 