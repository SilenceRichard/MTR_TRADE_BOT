import axios from "axios";
import { METEORA_API_URL, QueryParams } from "../config";
import { formatPoolsData, Pool } from "../utils/format";

const MAX_RETRIES = 3;

// 获取流动性池数据
export const fetchMeteoraPools = async (
  query: QueryParams
): Promise<Pool[]> => {
  let attempts = 0;
  while (attempts < MAX_RETRIES) {
    try {
      const url = new URL(METEORA_API_URL);
      const params = new URLSearchParams(query as any);
      url.search = params.toString();

      const response = await axios.get(url.toString());

      return formatPoolsData(response.data);
    } catch (error) {
      attempts++;
      if (attempts >= MAX_RETRIES) {
        console.error("Error fetching Meteora pools:", error);
        throw new Error("Error fetching Meteora pools");
      }
    }
  }
  return [];
}; 