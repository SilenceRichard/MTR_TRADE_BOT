import BigNumber from "bignumber.js";
import { PairInfo } from "../config";

// 定义 Pool 结构
export type Pool = {
  id: string;
  name: string;
  poolCount: string;
  mint_x?: string;
  mint_y?: string;
  tvl: string;
  volume: string;
  feeRatio: string;
  poolPairs: {
    mint_x: string;
    mint_y: string;
    name: string;
    binStep: number;
    address: string;
    tvl: string;
    volume: string;
    feeRatio: string;
  }[];
};

export const getTokenName = (pair: PairInfo) => {
  const names = pair.name?.split("-");
  return {
    tokenX: names?.[0],
    tokenY: names?.[1],
  }
}

// 格式化数字：自动转换 K/M/B，去掉多余 0
export const formatNumber = (num: BigNumber): string => {
  if (num.isZero()) return "0";

  const absNum = num.abs();
  if (absNum.gte(1e9)) return num.div(1e9).toFixed(2).replace(/\.00$/, "") + "B";
  if (absNum.gte(1e6)) return num.div(1e6).toFixed(2).replace(/\.00$/, "") + "M";
  if (absNum.gte(1e3)) return num.div(1e3).toFixed(2).replace(/\.00$/, "") + "K";
  
  return num.toFixed(2).replace(/\.00$/, ""); // 保留最多 2 位小数，去掉 0
};

// 处理 API 返回的数据
export const formatPoolsData = (metaData: any): Pool[] => {
  if (!metaData || !metaData.groups) return [];

  return metaData.groups.map((pool: any, index: number) => {
    const id = `${pool.name}_${index}`;
    const poolCount = `${pool.pairs?.length || 0} pools`;

    // 计算 TVL
    const tvl = pool.pairs?.reduce((acc: BigNumber, curr: any) => {
      return acc.plus(new BigNumber(curr.liquidity || "0"));
    }, new BigNumber(0));

    // 计算 24h 交易量
    const volume24 = pool.pairs?.reduce((acc: BigNumber, curr: any) => {
      return acc.plus(new BigNumber(curr.trade_volume_24h || "0"));
    }, new BigNumber(0));

    // 计算最大手续费比率（百分比格式）
    const maxFeeRatio = pool.pairs?.reduce((acc: number, curr: any) => {
      return Math.max(acc, Number(curr.fee_tvl_ratio?.hour_24 || "0"));
    }, 0);

    return {
      id,
      name: pool.name,
      poolCount,
      mint_x: pool.pairs?.[0]?.mint_x,
      mint_y: pool.pairs?.[0]?.mint_y,
      tvl: formatNumber(tvl), // 优化 TVL 格式
      volume: formatNumber(volume24), // 优化交易量格式
      feeRatio: `${maxFeeRatio.toFixed(2)}%`, // 保留两位小数
      poolPairs: pool.pairs?.map((pair: any) => ({
        mint_x: pair.mint_x,
        mint_y: pair.mint_y,
        name: pair.name,
        binStep: pair.bin_step,
        address: pair.address,
        tvl: formatNumber(new BigNumber(pair.liquidity || "0")), // 优化 TVL
        volume: formatNumber(new BigNumber(pair.trade_volume_24h || "0")), // 优化交易量
        feeRatio: `${formatNumber(new BigNumber(pair.fee_tvl_ratio?.hour_24 || "0"))}%`, // 优化手续费率
      })),
    };
  });
};
