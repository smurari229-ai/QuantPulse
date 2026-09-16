export interface BacktestParameters {
  strategyId: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  slippageModel: 'ZERO' | 'FIXED_BPS' | 'VOLATILITY_SQUARE_ROOT';
  slippageBps: number; // e.g. 5 bps
  commissionRatePct: number; // e.g. 0.03% broker fee
  taxRatePct: number; // e.g. 0.01% STT / exchange turnover
  outOfSampleSplitRatio: number; // e.g. 0.30 (30% out-of-sample)
  enableWalkForward: boolean;
  walkForwardFolds: number; // e.g. 3 folds
  positionSizingPct: number; // e.g. 10% per trade
}

export interface BacktestTrade {
  tradeId: string;
  symbol: string;
  entryTimestamp: number;
  exitTimestamp: number;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  side: 'BUY' | 'SELL';
  grossPnL: number;
  netPnL: number;
  returnPct: number;
  slippagePaid: number;
  feesPaid: number;
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'SIGNAL_REVERSAL' | 'TIME_HORIZON_EXPIRED';
  durationBars: number;
  isOutOfSample: boolean;
}

export interface QuantitativeMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  profitFactor: number;
  netProfit: number;
  netProfitPct: number;
  cagrPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdownPct: number;
  maxDrawdownDurationDays: number;
  averageWin: number;
  averageLoss: number;
  winLossRatio: number;
  maxLosingStreak: number;
  marketExposurePct: number;
  totalFeesPaid: number;
  totalSlippageCost: number;
  sampleSizeWarning: {
    isUnderSampled: boolean;
    warningMessage: string | null;
    recommendedMinTrades: number;
  };
}

export interface WalkForwardPeriodResult {
  foldIndex: number;
  inSampleRange: { start: string; end: string };
  outOfSampleRange: { start: string; end: string };
  inSampleSharpe: number;
  outOfSampleSharpe: number;
  degradationRatio: number; // outOfSampleSharpe / inSampleSharpe (detects overfitting)
  outOfSampleReturnPct: number;
  outOfSampleDrawdownPct: number;
}

export interface BacktestRunResult {
  id: string;
  timestamp: number;
  parameters: BacktestParameters;
  inSampleMetrics: QuantitativeMetrics;
  outOfSampleMetrics: QuantitativeMetrics;
  combinedMetrics: QuantitativeMetrics;
  walkForwardResults: WalkForwardPeriodResult[];
  equityCurve: { timestamp: number; equity: number; drawdownPct: number; benchmarkEquity: number }[];
  trades: BacktestTrade[];
  overfittingRiskAssessment: 'LOW' | 'MODERATE' | 'HIGH_OVERFIT_DETECTED';
}
