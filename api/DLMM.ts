import DLMM from "@meteora-ag/dlmm";
import axios from "axios";

export async function getActiveBin(dlmmPool: DLMM) {
  // Get pool state
  const activeBin = await dlmmPool.getActiveBin();
  return activeBin;
}

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
    const res = await axios.get(`https://app.meteora.ag/clmm-api/pair/${pairHash}`);
    const pairInfo: PairInfo = res.data;
    if (!pairInfo) {
      throw new Error('Pair not found');
    }
    return pairInfo;
  } catch (error) {
    console.error('Error fetching pair info:', error);
    return null;
  }
}
