/**
 * @meteora-ag/dlmm 模块的模拟
 */

// 模拟DLMM类
const mockDLMM = {
  create: jest.fn().mockImplementation(() => ({
    getPositionsByUserAndLbPair: jest.fn().mockResolvedValue({
      userPositions: []
    })
  }))
};

export default mockDLMM; 