import { AIDecisionOutput, AIFeatureInput } from '../types/ai';

export const AI_CONFIDENCE_DISCLOSURE = 
  'Statistical Advisory: The AI confidence score (0.00-1.00) is an uncalibrated heuristic rating representing pattern affinity. It does NOT represent a probability of profit or expected return. Financial markets are non-stationary and past predictive correlations decay.';

export function generateAIDecision(features: AIFeatureInput): AIDecisionOutput {
  const { currentPrice, indicators, newsSentiment, currentMarketConditions, symbol } = features;
  const risk_flags: string[] = [];
  const required_checks: string[] = [];

  // Data sanity check
  if (currentMarketConditions.dataStalenessMs > 3000) {
    risk_flags.push('DATA_STALENESS_EXCEEDS_MAX_TOLERANCE');
    required_checks.push('Verify feed latency with broker gateway');
  }

  if (currentMarketConditions.spreadBps > 15) {
    risk_flags.push('WIDE_BID_ASK_SPREAD_HIGH_SLIPPAGE_RISK');
    required_checks.push('Confirm order book depth before sizing');
  }

  // Volatility check
  const atrRatio = indicators.atr14 / currentPrice;
  if (atrRatio > 0.03) {
    risk_flags.push('ELEVATED_VOLATILITY_EXPANSION');
    required_checks.push('Tighten maximum position sizing by 50%');
  }

  // News check
  if (newsSentiment && Math.abs(newsSentiment.score) > 0.5) {
    risk_flags.push(`HIGH_IMPACT_NEWS_EVENT_${newsSentiment.score > 0 ? 'BULLISH' : 'BEARISH'}`);
  }

  // Mandatory checks that MUST always be enforced by Risk Engine
  required_checks.push('Enforce deterministic Stop-Loss');
  required_checks.push('Verify portfolio aggregate exposure < 70%');
  required_checks.push('Verify duplicate order filter window');
  required_checks.push('Check daily loss circuit breaker');

  // Decision logic (Strictly probabilistic/heuristic, NO guaranteed claims)
  let signal: AIDecisionOutput['signal'] = 'NO_TRADE';
  let confidence = 0.50;
  let reasoning = 'Market conditions neutral. No clear statistical edge identified.';
  let strategy = 'TF_EMA_CROSS';

  if (indicators.marketRegime === 'HIGH_VOLATILITY_SHOCK') {
    signal = 'NO_TRADE';
    confidence = 0.85;
    reasoning = 'High volatility shock regime detected. Preserving capital is optimal; all new entries suspended.';
    strategy = 'CAPITAL_PRESERVATION_HALT';
    risk_flags.push('REGIME_SHOCK_ACTIVE');
  } else if (indicators.rsi14 < 30 && currentPrice < indicators.ema50 && indicators.relativeVolume > 1.2) {
    signal = 'BUY';
    confidence = 0.68;
    strategy = 'MR_RSI_BOLLINGER';
    reasoning = `Oversold RSI (${indicators.rsi14}) with high volume capitulation in ${indicators.marketRegime}. Favorable asymmetric mean reversion setup with strictly defined stop loss.`;
  } else if (indicators.ema20 > indicators.ema50 && indicators.ema50 > indicators.ema200 && indicators.rsi14 > 52 && indicators.rsi14 < 68) {
    signal = 'BUY';
    confidence = 0.72;
    strategy = 'TF_EMA_CROSS';
    reasoning = `Strong alignment of moving average cascade (20 > 50 > 200 EMA). Trend persistence probability positive in ${indicators.marketRegime}.`;
  } else if (indicators.rsi14 > 72 && currentPrice > indicators.ema20 * 1.05) {
    signal = 'SELL';
    confidence = 0.65;
    strategy = 'MR_RSI_BOLLINGER';
    reasoning = `Overextended bullish price action (RSI ${indicators.rsi14}). Elevated probability of mean reversion or consolidation pullback.`;
  } else {
    signal = 'HOLD';
    confidence = 0.55;
    reasoning = `Price action in consolidation (Regime: ${indicators.marketRegime}). Current risk/reward does not exceed minimum institutional hurdle. Recommend waiting.`;
    strategy = 'SYSTEM_WAIT';
  }

  return {
    signal,
    confidence,
    confidenceCalibrationNote: AI_CONFIDENCE_DISCLOSURE,
    reasoning,
    strategy,
    risk_flags,
    required_checks,
    generatedAt: Date.now(),
    modelIdentifier: 'GEMINI-PRO-QUANT-DECISION-V2.4',
    featuresUsed: {
      price: currentPrice,
      regime: indicators.marketRegime,
      rsi: indicators.rsi14,
      trend: indicators.ema20 > indicators.ema50 ? 'BULLISH' : 'BEARISH',
      volatilityAtr: indicators.atr14,
      volumeCondition: indicators.relativeVolume > 1.2 ? 'HIGH_EXPANSION' : 'NORMAL',
    },
  };
}
