import { RiskValidationVerdict, RiskEngineConfig, IndividualRiskCheckResult } from './risk';
import { AIDecisionOutput } from './ai';

export type { RiskValidationVerdict, RiskEngineConfig, IndividualRiskCheckResult };

export type SystemExecutionMode = 'OFFLINE' | 'PAPER' | 'LIVE_BLOCKED';

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET';
export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus = 
  | 'PROPOSED'
  | 'VALIDATED_BY_RISK'
  | 'REJECTED_BY_RISK'
  | 'SUBMITTED_TO_BROKER'
  | 'FILLED'
  | 'PARTIALLY_FILLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED_BY_BROKER';

export interface OrderRequest {
  id: string;
  orderId?: string;
  clientOrderId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  estimatedPrice?: number;
  estimatedSlippageBps?: number;
  strategyId?: string;
  createdAt?: number;
  timestamp?: number;
  aiDecisionId?: string;
  aiDecisionReference?: AIDecisionOutput;
  executionMode: SystemExecutionMode;
}

export interface OrderFill {
  fillId: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  price: number;
  slippageIncurredBps: number;
  slippageBps?: number;
  brokerFee: number;
  brokerageFee?: number;
  exchangeFee: number;
  taxesApplicable: number; // e.g. STT / Transaction taxes
  totalCharges: number;
  timestamp: number;
  brokerOrderId: string;
}

export interface Position {
  symbol: string;
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  realizedPnL: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  notionalExposurePct: number;
  highestPriceSinceEntry: number; // For trailing stops
  openedAt: number;
}

export interface PortfolioState {
  cash: number;
  initialCapital: number;
  equity: number;
  totalUnrealizedPnL: number;
  totalRealizedPnL: number;
  dailyPnL: number;
  dailyPnLPct: number;
  dayStartEquity: number;
  dayStartTimestamp: number;
  peakEquity: number;
  currentDrawdownPct: number;
  marginUsed: number;
  availableMargin: number;
  positionsCount: number;
  portfolioExposurePct: number;
  positions: Position[];
  lastUpdated: number;
}
