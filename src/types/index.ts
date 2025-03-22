import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { StrategyParameters } from "@meteora-ag/dlmm";

/**
 * Bot state for waiting for position creation
 */
export interface PositionCreationState {
  positionKeyPair: Keypair;
  totalXAmount: BN;
  totalYAmount: BN;
  strategy: StrategyParameters;
  sellTokenMint: string;
  sellTokenSymbol: string;
  sellTokenAmount: BN;
  buyTokenMint: string;
  buyTokenSymbol: string;
  expectedBuyAmount: string;
  entryPrice: number;
}

/**
 * State for amount input
 */
export interface AmountInputState {
  tokenMint: string;
  sellTokenName: string;
  balance: number;
}

/**
 * Token pair information from Meteora
 */
export interface PairInfo {
  name: string;
  address: string;
  mint_x: string;
  mint_y: string;
  fee_rate: number;
  pool_state: string;
  creator_address: string;
  bin_step: number;
}

/**
 * Basic token information with decimals
 */
export interface TokenInfo {
  mint: string;
  decimals: number;
  symbol: string;
}

/**
 * Application context shared across components
 */
export interface AppContext {
  bot: any; // TelegramBot
  user: Keypair;
  connection: any; // Connection
  positionStorage: any; // FilePositionStorage
  userWalletMapStorage: any; // FileUserWalletMapStorage
}

/**
 * Keyboard Button Interface for Telegram
 */
export interface KeyboardButton {
  text: string;
  callback_data: string;
}

/**
 * Message options for Telegram messages
 */
export interface MessageOptions {
  parse_mode?: string;
  reply_markup?: {
    inline_keyboard?: KeyboardButton[][];
  };
  disable_web_page_preview?: boolean;
} 