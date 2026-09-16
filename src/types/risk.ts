export interface RiskEngineConfig {
  maxPositionSizeNotional: number; // e.g. $25,000 max per single position
  maxPositionPctOfPortfolio: number; // e.g. 20% max
  maxPortfolioExposurePct: number; // e.g. 70% max invested capital
  maxDailyLossPct: number; // e.g. 3.0% daily halt
  maxDrawdownHaltPct: number; // e.g. 8.0% circuit breaker
  maxTradesPerDay: number; // e.g. 15 trades
  minOrderIntervalSeconds: number; // e.g. minimum 30s between orders on same asset (prevents frequency spikes)
  minRiskRewardRatio: number; // e.g. 1.5:1 min
  maxEstimatedSlippageBps: number; // e.g. 25 bps (0.25%)
  maxDataStalenessMs: number; // e.g. 3000ms max allowed data age
  requireStopLoss: boolean; // must always be true
  requireTakeProfit: boolean; // must always be true
  maxSpreadBps: number; // e.g. 20 bps
  enforceDuplicateWindowSeconds: number; // e.g. 60 seconds duplicate filter
}

export type RiskCheckName =
  | 'MAX_POSITION_SIZE'
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
