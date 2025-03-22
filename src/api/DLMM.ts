import DLMM, { BinLiquidity, StrategyParameters } from "@meteora-ag/dlmm";
import { Connection, PublicKey } from "@solana/web3.js";
import axios from "axios";
import BN from "bn.js";
import {
  ComputeBudgetProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

const STEP = 5;

export type PairInfo = {
  address: string;
  apr: number;
  apy: number;
  base_fee_percentage: string;
  bin_step: number;
  cumulative_fee_volume: string;
  cumulative_trade_volume: string;
  current_price: number;
  farm_apr: number;
  farm_apy: number;
  fees_24h: number;
  hide: boolean;
  is_blacklisted: boolean;
  liquidity: string;
  max_fee_percentage: string;
  mint_x: string;
  mint_y: string;
  name: string;
  protocol_fee_percentage: string;
  reserve_x: string;
  reserve_x_amount: number;
  reserve_y: string;
  reserve_y_amount: number;
  reward_mint_x: string;
  reward_mint_y: string;
  today_fees: number;
  trade_volume_24h: number;
  fee_tvl_ratio: {
    min_30: number;
    hour_1: number;
    hour_2: number;
    hour_4: number;
    hour_12: number;
    hour_24: number;
  };
};
export async function fetchPairInfo(pairHash: string) {
  try {
    const res = await axios.get(
      `https://app.meteora.ag/clmm-api/pair/${pairHash}`
    );
    const pairInfo: PairInfo = res.data;
    if (!pairInfo) {
      throw new Error("Pair not found");
    }
    return pairInfo;
  } catch (error) {
    console.error("Error fetching pair info:", error);
    return null;
  }
}

export const getActiveBin = async (dlmmPool: DLMM) => {
  // Get pool state
  const activeBin = await dlmmPool.getActiveBin();
  return activeBin;
};
const getMinBinId = (props: {
  step: number;
  actBin: BinLiquidity;
  sellingX: boolean;
}) => {
  const { step, actBin, sellingX } = props;
  const minBinId = sellingX ? actBin.binId : actBin.binId - step;
  return minBinId;
};
const getMaxBinId = (props: {
  step: number;
  actBin: BinLiquidity;
  sellingX: boolean;
}) => {
  const { step, actBin, sellingX } = props;
  const maxBinId = sellingX ? actBin.binId + step : actBin.binId;
  return maxBinId;
};

export const getBinsBetweenLowerAndUpperBound = async (props: {
  dlmmPool: DLMM,
  actBin: BinLiquidity,
  sellingX: boolean;
}) => {
  const { dlmmPool, actBin, sellingX } = props;
  const maxBinId = getMaxBinId({ step: STEP, actBin, sellingX });
  const minBinId = getMinBinId({ step: STEP, actBin, sellingX });
  const bins = await dlmmPool.getBinsBetweenLowerAndUpperBound(minBinId, maxBinId);
  return bins;
};

/**
 * Creates a position on the Meteora DLMM protocol
 * @param dlmmPool - The DLMM pool instance
 * @param params - Parameters for creating the position
 * @returns The transaction for creating the position
 */
export const createOneSidePositions = async (
  dlmmPool: DLMM,
  params: {
    connection: Connection;
    user: PublicKey;
    positionPubKey: PublicKey;
    totalXAmount: BN;
    totalYAmount: BN;
    strategy: StrategyParameters;
  }
) => {
  const { connection, totalXAmount, positionPubKey, user, totalYAmount, strategy } = params;
  
  console.log("开始创建仓位...");
  console.log("仓位参数:", {
    positionPubKey: positionPubKey.toString(),
    user: user.toString(),
    totalXAmount: totalXAmount.toString(),
    totalYAmount: totalYAmount.toString(),
    strategyType: strategy.strategyType,
    ...(strategy.strategyType ? { strategyType: strategy.strategyType } : {}),
    ...(strategy as any).lowerBinId !== undefined ? { lowerBinId: (strategy as any).lowerBinId } : {},
    ...(strategy as any).upperBinId !== undefined ? { upperBinId: (strategy as any).upperBinId } : {}
  });
  
  try {
    // 获取活跃bin验证参数合理性
    const activeBin = await getActiveBin(dlmmPool);
    console.log("当前活跃bin:", activeBin.binId.toString(), "价格:", activeBin.pricePerToken.toString());
    
    // 检查bin范围是否设置合理
    if ((strategy as any).lowerBinId !== undefined && (strategy as any).upperBinId !== undefined) {
      const lowerBinId = (strategy as any).lowerBinId;
      const upperBinId = (strategy as any).upperBinId;
      // 简单地转为数值
      const activeBinId = parseInt(activeBin.binId.toString());
      
      // 检查bin范围是否包含活跃bin
      const containsActiveBin = lowerBinId <= activeBinId && activeBinId <= upperBinId;
      console.log(`Bin范围检查: [${lowerBinId} - ${upperBinId}], 活跃bin: ${activeBinId}, 包含活跃bin: ${containsActiveBin}`);
      
      // 检查bin范围是否过窄
      const binRange = upperBinId - lowerBinId;
      console.log(`Bin范围宽度: ${binRange}, 最小建议宽度: 5`);
      
      if (binRange < 3) {
        console.warn("警告: bin范围可能过窄，这可能导致交易失败");
      }
      
      if (!containsActiveBin) {
        console.warn("警告: 设置的bin范围不包含当前活跃bin，可能不会创建有效仓位");
      }
    }
    
    // 检查流动性分布
    console.log("检查是否提供了流动性:");
    const hasXLiquidity = !totalXAmount.isZero();
    const hasYLiquidity = !totalYAmount.isZero();
    console.log(`提供X流动性: ${hasXLiquidity}, 提供Y流动性: ${hasYLiquidity}`);
    
    if (!hasXLiquidity && !hasYLiquidity) {
      console.error("错误: 没有提供任何流动性");
      throw new Error("No liquidity provided for position creation");
    }
    
    // 尝试使用更安全的流动性范围设置
    let adjustedStrategy = {...strategy};
    
    // 如果是单侧流动性且bin范围问题，尝试调整范围
    if ((hasXLiquidity && !hasYLiquidity) || (!hasXLiquidity && hasYLiquidity)) {
      console.log("检测到单侧流动性添加，验证策略设置...");
      
      if ((adjustedStrategy as any).lowerBinId !== undefined && (adjustedStrategy as any).upperBinId !== undefined) {
        // 简单地转为数值
        const activeBinId = parseInt(activeBin.binId.toString());
        const originalLower = (adjustedStrategy as any).lowerBinId;
        const originalUpper = (adjustedStrategy as any).upperBinId;
        
        // 单侧X流动性，确保范围包含并高于活跃bin
        if (hasXLiquidity && !hasYLiquidity && originalUpper < activeBinId + 3) {
          console.log("调整X流动性范围，确保覆盖活跃bin以上");
          (adjustedStrategy as any).upperBinId = Math.max(originalUpper, activeBinId + 5);
        }
        
        // 单侧Y流动性，确保范围包含并低于活跃bin
        if (!hasXLiquidity && hasYLiquidity && originalLower > activeBinId - 3) {
          console.log("调整Y流动性范围，确保覆盖活跃bin以下");
          (adjustedStrategy as any).lowerBinId = Math.min(originalLower, activeBinId - 5);
        }
        
        // 记录调整后的策略
        if (originalLower !== (adjustedStrategy as any).lowerBinId || originalUpper !== (adjustedStrategy as any).upperBinId) {
          console.log("策略已调整:", {
            原始范围: `[${originalLower} - ${originalUpper}]`,
            调整后范围: `[${(adjustedStrategy as any).lowerBinId} - ${(adjustedStrategy as any).upperBinId}]`
          });
        }
      }
    }
    
    // 创建仓位交易
    console.log("调用DLMM SDK创建仓位交易...");
    const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: positionPubKey,
      user,
      totalXAmount,
      totalYAmount,
      strategy: adjustedStrategy, // 使用调整后的策略
    });
    
    console.log("仓位交易创建成功，开始优化交易参数...");
    console.log("交易指令数量:", createPositionTx.instructions.length);
    
    // 优化交易
    const optimalTx = await buildOptimalTransaction({
      transaction: createPositionTx,
      connection,
      publicKey: user
    });
    
    console.log("交易优化完成，返回交易数据");
    return optimalTx;
  } catch (error) {
    console.error("创建仓位时发生错误:", error);
    
    // 检查是否是用户余额不足的错误
    try {
      const userBalance = await connection.getBalance(user);
      console.log("用户SOL余额:", userBalance / 1e9, "SOL");
      
      // 获取用户的代币账户信息
      console.log("尝试获取代币账户信息...");
      // 记录池子地址信息
      try {
        // 记录池子对象信息，无需访问具体属性
        console.log("DLMM池子对象存在:", !!dlmmPool);
        // 尝试获取活跃bin信息，这可能更有助于诊断问题
        try {
          const activeBin = await getActiveBin(dlmmPool);
          console.log("当前活跃bin信息:", {
            binId: activeBin.binId.toString(),
            price: activeBin.pricePerToken.toString()
          });
        } catch (binError) {
          console.error("获取活跃bin失败:", binError);
        }
      } catch (poolError) {
        console.error("获取池子信息失败:", poolError);
      }
      
      // 查询是否有相关代币账户
      // 这里只是记录调试信息，具体实现取决于项目的Token账户查询方式
    } catch (balanceError) {
      console.error("获取用户余额信息失败:", balanceError);
    }
    
    throw error;
  }
};

/**
 * Builds an optimized version of a transaction with appropriate compute budget settings
 * @param params - Parameters for building the optimized transaction
 * @returns The optimized transaction with appropriate settings
 */
export const buildOptimalTransaction = async (params: {
  transaction: Transaction;
  connection: Connection;
  publicKey: PublicKey;
}) => {
  const { transaction, connection, publicKey } = params;
  if (!publicKey) {
    throw new Error("Public key is required");
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  // 先模拟交易获取实际消耗CU
  const simTx = new VersionedTransaction(
    new TransactionMessage({
      instructions: transaction.instructions,
      recentBlockhash: blockhash,
      payerKey: publicKey,
    }).compileToV0Message()
  );

  const simResult = await connection.simulateTransaction(simTx, {
    sigVerify: false,
  });

  if (simResult.value.err) {
    console.error("Simulation failed:", simResult.value.err);
    throw new Error(`Simulation Error: ${JSON.stringify(simResult.value.err)}`);
  }

  const consumedCU = simResult.value.unitsConsumed || 200_000;
  console.log("Actual consumed CU:", consumedCU);

  // 设置额外 buffer 防止失败
  const cuBufferMultiplier = 1.2; // 增加20%的buffer
  const optimalUnits = Math.min(
    Math.ceil(consumedCU * cuBufferMultiplier),
    1_400_000
  );

  // 你可以根据业务需求动态计算优先级费用
  const microLamports = 10; // 或根据网络状态动态调整

  const newComputeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: optimalUnits,
  });
  const newComputePriceIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports,
  });

  // 过滤掉 transaction 中原有的 ComputeBudgetProgram 指令
  const filteredInstructions = transaction.instructions.filter(
    (ix) => !ix.programId.equals(ComputeBudgetProgram.programId)
  );

  const instructions = [
    newComputeLimitIx,
    newComputePriceIx,
    ...filteredInstructions,
  ];

  const opTx = new VersionedTransaction(
    new TransactionMessage({
      instructions,
      recentBlockhash: blockhash,
      payerKey: publicKey,
    }).compileToV0Message()
  );

  return { opTx, blockhash, lastValidBlockHeight, optimalUnits };
};