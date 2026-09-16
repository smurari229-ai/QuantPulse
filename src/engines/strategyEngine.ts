import { StrategyDefinition, StrategySignalOutput, TechnicalIndicators } from '../types/strategy';
import { OHLCV } from '../types/market';
import { analyzeMarketFeatures } from './marketAnalysisEngine';

export const REGISTERED_STRATEGIES: StrategyDefinition[] = [
  {
    id: 'TF_EMA_CROSS',
    name: 'Dual EMA Trend Following with 200 EMA Regime Filter',
    type: 'TREND_FOLLOWING',
    description: 'Enters in the direction of the dominant macro trend when the 20 EMA crosses the 50 EMA and price is above the 200 EMA.',
    entryConditions: [
      'Price > EMA 200 (Macro Bullish filter)',
      'EMA 20 crosses above EMA 50 for Long',
      'Relative volume > 1.1x 20-period average volume',
    ],
    exitConditions: [
      'EMA 20 crosses below EMA 50',
      'Trailing stop-loss breached at 2.0x ATR',
      'Take-profit hit at 3.5x ATR',
    ],
    stopLossRule: '2.0x ATR from entry price',
    takeProfitRule: '3.5x ATR from entry price (1.75:1 Risk/Reward)',
    positionSizingMethod: 'VOLATILITY_ADJUSTED',
    requiredIndicators: ['EMA 20', 'EMA 50', 'EMA 200', 'ATR 14', 'Volume'],
    assumptions: [
      'Market exhibits persistent momentum autocorrelation',
      'Whipsaw losses during range-bound regimes will be compensated by large trend runs',
    ],
    isActive: true,
    minConfidenceThreshold: 0.65,
  },
  {
    id: 'MR_RSI_BOLLINGER',
    name: 'Bollinger Band & RSI Mean Reversion',
    type: 'MEAN_REVERSION',
    description: 'Identifies statistically stretched price action where RSI < 30 and price touches the lower 2-sigma Bollinger Band in a non-trending regime.',
    entryConditions: [
      'Market Regime is MEAN_REVERTING_RANGE or LOW_VOLATILITY_CONSOLIDATION',
      'RSI 14 < 32 (Oversold condition)',
      'Price <= Lower Bollinger Band (2 standard deviations)',
    ],
    exitConditions: [
      'Price returns to Bollinger Middle Band (SMA 20)',
      'RSI 14 rises above 55',
      'Stop-loss breached at 1.5x ATR below band',
    ],
    stopLossRule: '1.5x ATR below lower Bollinger Band',
    takeProfitRule: 'Middle Bollinger Band SMA 20',
    positionSizingMethod: 'FIXED_FRACTIONAL',
    requiredIndicators: ['Bollinger Bands (20,2)', 'RSI 14', 'ATR 14'],
    assumptions: [
      'Prices follow Ornstein-Uhlenbeck mean-reverting process during sideways regimes',
      'Regime classifier effectively gates out trending selloffs',
    ],
    isActive: true,
    minConfidenceThreshold: 0.70,
  },
  {
    id: 'BO_VOLATILITY_SQUEEZE',
    name: 'Bollinger Band Squeeze Volatility Breakout',
    type: 'BREAKOUT',
    description: 'Detects volatility compression (Bandwidth < 3.5%) followed by expansion candle and high volume breakout.',
    entryConditions: [
      'Bollinger Bandwidth was in lowest 20th percentile for >= 10 bars',
      'Close breaks outside upper Bollinger Band',
      'Relative volume > 1.5x average',
    ],
    exitConditions: [
      'Candle closes back inside Bollinger Band',
      'Stop-loss breached at previous bar low',
    ],
    stopLossRule: 'Low of the breakout bar',
    takeProfitRule: '2.5x Breakout bar range (2.0:1 Risk/Reward)',
    positionSizingMethod: 'FIXED_NOTIONAL',
    requiredIndicators: ['Bollinger Bands', 'ATR 14', 'Volume Profile'],
    assumptions: [
      'Prolonged compression leads to violent directional expansion',
      'Slippage on breakout can be higher than average',
    ],
    isActive: true,
    minConfidenceThreshold: 0.68,
  },
  {
    id: 'MOM_MACD_HIST',
    name: 'MACD Histogram Acceleration Momentum',
    type: 'MOMENTUM',
    description: 'Enters on positive acceleration of MACD histogram above zero line confirming buyers taking control.',
    entryConditions: [
      'MACD Histogram > 0 and greater than previous 2 bars',
      'RSI 14 between 48 and 65 (not overbought)',
      'Price > EMA 50',
    ],
    exitConditions: [
      'MACD Histogram declines for 2 consecutive bars',
      'RSI 14 > 75 (Take-profit zone)',
    ],
    stopLossRule: '1.8x ATR below entry',
    takeProfitRule: '3.0x ATR above entry',
    positionSizingMethod: 'KELLY_CRITERION_HALF',
    requiredIndicators: ['MACD (12,26,9)', 'RSI 14', 'EMA 50', 'ATR 14'],
    assumptions: [
      'Second derivative of moving averages (histogram slope) leads price turnarounds',
    ],
    isActive: true,
    minConfidenceThreshold: 0.60,
  },
];

export function evaluateStrategySignal(
  strategy: StrategyDefinition,
  symbol: string,
  bars: OHLCV[]
): StrategySignalOutput {
  const indicators = analyzeMarketFeatures(bars);
  const currentPrice = bars[bars.length - 1].close;
  const timestamp = bars[bars.length - 1].timestamp;

  let signal: StrategySignalOutput['signal'] = 'NO_TRADE';
  let rationale = 'Conditions for strategy entry not fully satisfied.';
  let stopLoss = currentPrice * 0.98;
  let takeProfit = currentPrice * 1.03;

  if (strategy.id === 'TF_EMA_CROSS') {
    const isBullTrend = indicators.ema20 > indicators.ema50 && currentPrice > indicators.ema200;
    const isBearTrend = indicators.ema20 < indicators.ema50 && currentPrice < indicators.ema200;

    if (isBullTrend && indicators.volumeProfile.relativeVolume >= 1.0 && indicators.rsi14 < 68) {
      signal = 'BUY';
      stopLoss = Math.round((currentPrice - 2.0 * indicators.atr14) * 100) / 100;
      takeProfit = Math.round((currentPrice + 3.5 * indicators.atr14) * 100) / 100;
      rationale = `Bullish EMA crossover (20 > 50 > 200), healthy RSI (${indicators.rsi14}), volume ${indicators.volumeProfile.relativeVolume}x.`;
    } else if (isBearTrend && indicators.volumeProfile.relativeVolume >= 1.0 && indicators.rsi14 > 32) {
      signal = 'SELL';
      stopLoss = Math.round((currentPrice + 2.0 * indicators.atr14) * 100) / 100;
      takeProfit = Math.round((currentPrice - 3.5 * indicators.atr14) * 100) / 100;
      rationale = `Bearish EMA crossover (20 < 50 < 200), volume confirmed.`;
    } else {
      signal = 'NO_TRADE';
      rationale = `No clean EMA divergence or regime mismatch (Regime: ${indicators.marketRegime}).`;
    }
  } else if (strategy.id === 'MR_RSI_BOLLINGER') {
    if (indicators.rsi14 < 32 && currentPrice <= indicators.bollinger.lower * 1.005) {
      signal = 'BUY';
      stopLoss = Math.round((currentPrice - 1.5 * indicators.atr14) * 100) / 100;
      takeProfit = indicators.bollinger.middle;
      rationale = `RSI oversold (${indicators.rsi14}) and price at lower 2-sigma Bollinger Band (${indicators.bollinger.lower}). Mean reversion target SMA 20.`;
    } else if (indicators.rsi14 > 68 && currentPrice >= indicators.bollinger.upper * 0.995) {
      signal = 'SELL';
      stopLoss = Math.round((currentPrice + 1.5 * indicators.atr14) * 100) / 100;
      takeProfit = indicators.bollinger.middle;
      rationale = `RSI overbought (${indicators.rsi14}) and price at upper Bollinger Band (${indicators.bollinger.upper}). Mean reversion target SMA 20.`;
    } else {
      signal = 'HOLD';
      rationale = `Price within normal Bollinger range. RSI at ${indicators.rsi14}.`;
    }
  } else if (strategy.id === 'BO_VOLATILITY_SQUEEZE') {
    if (indicators.bollinger.bandwidth < 0.045 && currentPrice > indicators.bollinger.upper) {
      signal = 'BUY';
      stopLoss = Math.round((currentPrice - 1.2 * indicators.atr14) * 100) / 100;
      takeProfit = Math.round((currentPrice + 2.5 * indicators.atr14) * 100) / 100;
      rationale = `Bollinger bandwidth squeeze (${(indicators.bollinger.bandwidth * 100).toFixed(2)}%) followed by upper breakout.`;
    } else {
      signal = 'NO_TRADE';
      rationale = 'Volatility compression conditions not active.';
    }
  } else {
    // Default momentum
    if (indicators.macd.histogram > 0 && indicators.rsi14 > 50 && indicators.rsi14 < 65) {
      signal = 'BUY';
      stopLoss = Math.round((currentPrice - 1.8 * indicators.atr14) * 100) / 100;
      takeProfit = Math.round((currentPrice + 3.0 * indicators.atr14) * 100) / 100;
      rationale = `Positive MACD histogram acceleration (+${indicators.macd.histogram}) with moderate RSI momentum (${indicators.rsi14}).`;
    } else {
      signal = 'NO_TRADE';
      rationale = 'MACD momentum neutral or declining.';
    }
  }

  const riskPerUnit = Math.abs(currentPrice - stopLoss);
  const rewardPerUnit = Math.abs(takeProfit - currentPrice);
  const riskRewardRatio = riskPerUnit > 0 ? Math.round((rewardPerUnit / riskPerUnit) * 100) / 100 : 0;

  return {
    strategyId: strategy.id,
    symbol,
    timestamp,
    signal,
    suggestedEntry: currentPrice,
    suggestedStopLoss: stopLoss,
    suggestedTakeProfit: takeProfit,
    riskRewardRatio,
    targetQuantity: 10,
    indicatorsSnapshot: indicators,
    rationale,
  };
}
