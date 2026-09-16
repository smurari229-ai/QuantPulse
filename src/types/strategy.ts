export type StrategyType = 
  | 'TREND_FOLLOWING' 
  | 'MOMENTUM' 
  | 'MEAN_REVERSION' 
  | 'BREAKOUT' 
  | 'VOLATILITY_EXPANSION' 
  | 'STATISTICAL_QUANT';

export type SignalType = 'BUY' | 'SELL' | 'HOLD' | 'NO_TRADE';

export interface StrategyDefinition {
  id: string;
  name: string;
  type: StrategyType;
  description: string;
  entryConditions: string[];
  exitConditions: string[];
  stopLossRule: string;
  takeProfitRule: string;
  positionSizingMethod: 'FIXED_FRACTIONAL' | 'VOLATILITY_ADJUSTED' | 'KELLY_CRITERION_HALF' | 'FIXED_NOTIONAL';
  requiredIndicators: string[];
  assumptions: string[];
  isActive: boolean;
  minConfidenceThreshold: number;
}

export interface TechnicalIndicators {
  ema20: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  macd: {
    macdLine: number;
    signalLine: number;
    histogram: number;
  };
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number;
  };
  atr14: number;
  volumeProfile: {
    relativeVolume: number;
    vwap: number;
  };
  supportResistance: {
    nearestSupport: number;
    nearestResistance: number;
    distanceToSupportPct: number;
    distanceToResistancePct: number;
  };
  marketRegime: 'TRENDING_BULL' | 'TRENDING_BEAR' | 'MEAN_REVERTING_RANGE' | 'HIGH_VOLATILITY_SHOCK' | 'LOW_VOLATILITY_CONSOLIDATION';
}

export interface StrategySignalOutput {
  strategyId: string;
  symbol: string;
  timestamp: number;
  signal: SignalType;
  suggestedEntry: number;
  suggestedStopLoss: number;
  suggestedTakeProfit: number;
  riskRewardRatio: number;
  targetQuantity: number;
  indicatorsSnapshot: TechnicalIndicators;
  rationale: string;
}
