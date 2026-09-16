export interface RiskEngineConfig {
  maxPositionSizeNotional: number;
  maxPositionPctOfPortfolio: number;
  maxPortfolioExposurePct: number;
  maxDailyLossPct: number;
  maxDrawdownHaltPct: number;
  maxTradesPerDay: number;
  minOrderIntervalSeconds: number;
  minRiskRewardRatio: number;
  maxEstimatedSlippageBps: number;
  maxDataStalenessMs: number;
  requireStopLoss: boolean;
  requireTakeProfit: boolean;
  maxSpreadBps: number;
  enforceDuplicateWindowSeconds: number;
}

export type RiskCheckName =
  | 'ORDER_MARKET_SANITY'
  | 'MAX_POSITION_SIZE'
  | 'MAX_POSITION_NOTIONAL'
  | 'MAX_POSITION_PCT_OF_PORTFOLIO'
  | 'MAX_PORTFOLIO_EXPOSURE'
  | 'MAX_DAILY_LOSS'
  | 'MAX_PORTFOLIO_DRAWDOWN'
  | 'MAX_TRADES_PER_DAY'
  | 'ORDER_FREQUENCY_THROTTLE'
  | 'MANDATORY_STOP_LOSS'
  | 'MANDATORY_TAKE_PROFIT'
  | 'RISK_REWARD_RATIO'
  | 'LIQUIDITY_SPREAD_CHECK'
  | 'SLIPPAGE_TOLERANCE'
  | 'DUPLICATE_ORDER_DETECTION'
  | 'STALE_DATA_GUARD'
  | 'BROKER_CONNECTIVITY_HEARTBEAT'
  | 'MARKET_ABNORMALITY_CIRCUIT_BREAKER';

export interface IndividualRiskCheckResult {
  checkName: RiskCheckName;
  gateName?: string;
  gateId?: string;
  status?: 'PASS' | 'FAILED' | 'CAUTION';
  passed: boolean;
  severity: 'CRITICAL_REJECT' | 'WARNING';
  currentValue: number | string | boolean;
  thresholdLimit: number | string | boolean;
  threshold?: number | string | boolean;
  reason: string;
  message?: string;
}

export interface RiskValidationVerdict {
  isApproved: boolean;
  timestamp: number;
  orderIdProposed: string;
  symbol: string;
  totalChecksCount: number;
  passedChecksCount: number;
  failedChecksCount: number;
  checks: IndividualRiskCheckResult[];
  rejectionReasons: string[];
  auditableRiskToken: string;
}
