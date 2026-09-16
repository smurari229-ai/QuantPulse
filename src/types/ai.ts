import { SignalType } from './strategy';

export interface AIDecisionOutput {
  signal: SignalType;
  confidence: number; // 0.00 to 1.00 (Uncalibrated raw heuristic score - NOT win probability)
  confidenceCalibrationNote: string;
  reasoning: string;
  strategy: string;
  risk_flags: string[];
  required_checks: string[];
  generatedAt: number;
  modelIdentifier: string;
  featuresUsed: {
    price: number;
    regime: string;
    rsi: number;
    trend: string;
    volatilityAtr: number;
    volumeCondition: string;
  };
}

export interface AIFeatureInput {
  symbol: string;
  timestamp: number;
  currentPrice: number;
  indicators: {
    ema20: number;
    ema50: number;
    ema200: number;
    rsi14: number;
    atr14: number;
    relativeVolume?: number;
    volumeProfile?: {
      relativeVolume: number;
      vwap: number;
    };
    marketRegime: string;
  };
  newsSentiment?: {
    headline: string;
    score: number; // -1 to +1
    source: string;
    timestamp: number;
  };
  currentMarketConditions: {
    spreadBps: number;
    dataStalenessMs: number;
  };
}
