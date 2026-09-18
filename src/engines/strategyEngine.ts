import { StrategyDefinition, StrategySignalOutput } from '../types/strategy';
import { OHLCV } from '../types/market';
import { analyzeMarketFeatures, calculateEMA, calculateRSI, calculateATR, calculateBollingerBands } from './marketAnalysisEngine';

export const REGISTERED_STRATEGIES: StrategyDefinition[] = [
  {
    id: 'TF_EMA_CROSS', name: 'Dual EMA Trend Following with 200 EMA Regime Filter', type: 'TREND_FOLLOWING',
    description: 'Enters in the direction of the dominant macro trend when the 20 EMA crosses the 50 EMA and price is above the 200 EMA.',
    entryConditions: ['Price > EMA 200 (Macro Bullish filter)', 'EMA 20 crosses above EMA 50 for Long', 'Relative volume > 1.1x 20-period average volume'],
    exitConditions: ['EMA 20 crosses below EMA 50', 'Trailing stop-loss breached at 2.0x ATR', 'Take-profit hit at 3.5x ATR'], stopLossRule: '2.0x ATR from entry price', takeProfitRule: '3.5x ATR from entry price (1.75:1 Risk/Reward)', positionSizingMethod: 'VOLATILITY_ADJUSTED', requiredIndicators: ['EMA 20', 'EMA 50', 'EMA 200', 'ATR 14', 'Volume'], assumptions: ['Market exhibits persistent momentum autocorrelation', 'Whipsaw losses during range-bound regimes will be compensated by large trend runs'], isActive: true, minConfidenceThreshold: 0.65,
  },
  {
    id: 'MR_RSI_BOLLINGER', name: 'Bollinger Band & RSI Mean Reversion', type: 'MEAN_REVERSION',
    description: 'Identifies statistically stretched price action where RSI < 30 and price touches the lower 2-sigma Bollinger Band in a non-trending regime.',
    entryConditions: ['Market Regime is MEAN_REVERTING_RANGE or LOW_VOLATILITY_CONSOLIDATION', 'RSI 14 < 32 (Oversold condition)', 'Price <= Lower Bollinger Band (2 standard deviations)'],
    exitConditions: ['Price returns to Bollinger Middle Band (SMA 20)', 'RSI 14 rises above 55', 'Stop-loss breached at 1.5x ATR below band'], stopLossRule: '1.5x ATR below lower Bollinger Band', takeProfitRule: 'Middle Bollinger Band SMA 20', positionSizingMethod: 'FIXED_FRACTIONAL', requiredIndicators: ['Bollinger Bands (20,2)', 'RSI 14', 'ATR 14'], assumptions: ['Prices follow Ornstein-Uhlenbeck mean-reverting process during sideways regimes', 'Regime classifier effectively gates out trending selloffs'], isActive: true, minConfidenceThreshold: 0.70,
  },
  {
    id: 'BO_VOLATILITY_SQUEEZE', name: 'Bollinger Band Squeeze Volatility Breakout', type: 'BREAKOUT',
    description: 'Detects volatility compression (Bandwidth < 3.5%) followed by expansion candle and high volume breakout.',
    entryConditions: ['Bollinger Bandwidth was in lowest 20th percentile for >= 10 bars', 'Close breaks outside upper Bollinger Band', 'Relative volume > 1.5x average'],
    exitConditions: ['Candle closes back inside Bollinger Band', 'Stop-loss breached at previous bar low'], stopLossRule: 'Low of the breakout bar', takeProfitRule: '2.5x Breakout bar range (2.0:1 Risk/Reward)', positionSizingMethod: 'FIXED_NOTIONAL', requiredIndicators: ['Bollinger Bands', 'ATR 14', 'Volume Profile'], assumptions: ['Prolonged compression leads to violent directional expansion', 'Slippage on breakout can be higher than average'], isActive: true, minConfidenceThreshold: 0.68,
  },
  {
    id: 'MOM_MACD_HIST', name: 'MACD Histogram Acceleration Momentum', type: 'MOMENTUM',
    description: 'Enters on positive acceleration of MACD histogram above zero line confirming buyers taking control.',
    entryConditions: ['MACD Histogram > 0 and greater than previous 2 bars', 'RSI 14 between 48 and 65 (not overbought)', 'Price > EMA 50'],
    exitConditions: ['MACD Histogram declines for 2 consecutive bars', 'RSI 14 > 75 (Take-profit zone)'], stopLossRule: '1.8x ATR below entry', takeProfitRule: '3.0x ATR above entry', positionSizingMethod: 'KELLY_CRITERION_HALF', requiredIndicators: ['MACD (12,26,9)', 'RSI 14', 'EMA 50', 'ATR 14'], assumptions: ['Second derivative of moving averages (histogram slope) leads price turnarounds'], isActive: true, minConfidenceThreshold: 0.60,
  },
];

export function evaluateStrategySignal(strategy: StrategyDefinition, symbol: string, bars: OHLCV[]): StrategySignalOutput {
  if (bars.length === 0) throw new Error('Strategy evaluation requires at least one OHLCV bar.');
  if (!REGISTERED_STRATEGIES.some((registered) => registered.id === strategy.id)) {
    const lastBar = bars[bars.length - 1];
    return {
      strategyId: strategy.id,
      symbol,
      timestamp: lastBar.timestamp,
      signal: 'NO_TRADE',
      suggestedEntry: lastBar.close,
      suggestedStopLoss: lastBar.close,
      suggestedTakeProfit: lastBar.close,
      riskRewardRatio: 0,
      targetQuantity: 0,
      indicatorsSnapshot: analyzeMarketFeatures(bars),
      rationale: `Unsupported strategy ID "${strategy.id}". Strategy evaluation halted safely.`,
    };
  }

  const indicators = analyzeMarketFeatures(bars);
  const closes = bars.map((bar) => bar.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(bars, 14);
  const bollinger = calculateBollingerBands(closes, 20, 2);
  const currentIndex = bars.length - 1;
  const currentPrice = bars[currentIndex].close;
  const timestamp = bars[currentIndex].timestamp;

  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || !Number.isFinite(indicators.atr14) || indicators.atr14 <= 0) {
    return { strategyId: strategy.id, symbol, timestamp, signal: 'NO_TRADE', suggestedEntry: currentPrice, suggestedStopLoss: currentPrice, suggestedTakeProfit: currentPrice, riskRewardRatio: 0, targetQuantity: 0, indicatorsSnapshot: indicators, rationale: 'Invalid price or ATR input; strategy evaluation halted safely.' };
  }

  let signal: StrategySignalOutput['signal'] = 'NO_TRADE';
  let rationale = 'Conditions for strategy entry not fully satisfied.';
  let stopLoss = currentPrice * 0.98;
  let takeProfit = currentPrice * 1.03;
  const currentRelativeVolume = indicators.volumeProfile.relativeVolume;
  const currentRsi = rsi[currentIndex];
  const currentEma20 = ema20[currentIndex];
  const currentEma50 = ema50[currentIndex];
  const currentAtr = atr[currentIndex];
  const currentBb = bollinger[currentIndex];

  if (
    !Number.isFinite(currentRsi) ||
    !Number.isFinite(currentEma20) ||
    !Number.isFinite(currentEma50) ||
    !Number.isFinite(currentAtr) ||
    currentAtr <= 0 ||
    !currentBb ||
    !Number.isFinite(currentBb.lower) ||
    !Number.isFinite(currentBb.middle) ||
    !Number.isFinite(currentBb.upper)
  ) {
    return {
      strategyId: strategy.id,
      symbol,
      timestamp,
      signal: 'NO_TRADE',
      suggestedEntry: currentPrice,
      suggestedStopLoss: currentPrice,
      suggestedTakeProfit: currentPrice,
      riskRewardRatio: 0,
      targetQuantity: 0,
      indicatorsSnapshot: indicators,
      rationale: 'Required indicator values are unavailable or invalid; strategy evaluation halted safely.',
    };
  }

  const regimeAllowsMeanReversion = indicators.marketRegime === 'MEAN_REVERTING_RANGE' || indicators.marketRegime === 'LOW_VOLATILITY_CONSOLIDATION';

  if (strategy.id === 'TF_EMA_CROSS') {
    const bullishCross = currentIndex > 0 && currentEma20 > currentEma50 && ema20[currentIndex - 1] <= ema50[currentIndex - 1];
    const bearishCross = currentIndex > 0 && currentEma20 < currentEma50 && ema20[currentIndex - 1] >= ema50[currentIndex - 1];
    if (bullishCross && currentPrice > indicators.ema200 && currentRelativeVolume > 1.1 && currentRsi < 68) {
      signal = 'BUY'; stopLoss = Math.round((currentPrice - 2.0 * currentAtr) * 100) / 100; takeProfit = Math.round((currentPrice + 3.5 * currentAtr) * 100) / 100;
      rationale = `Bullish EMA 20/50 crossover above EMA 200 with volume ${currentRelativeVolume}x and RSI ${currentRsi.toFixed(1)}.`;
    } else if (bearishCross && currentPrice < indicators.ema200 && currentRelativeVolume > 1.1 && currentRsi > 32) {
      signal = 'SELL'; stopLoss = Math.round((currentPrice + 2.0 * currentAtr) * 100) / 100; takeProfit = Math.round((currentPrice - 3.5 * currentAtr) * 100) / 100;
      rationale = `Bearish EMA 20/50 crossover below EMA 200 with volume ${currentRelativeVolume}x.`;
    } else rationale = `No qualifying EMA crossover/volume/regime combination (Regime: ${indicators.marketRegime}).`;
  } else if (strategy.id === 'MR_RSI_BOLLINGER') {
    if (regimeAllowsMeanReversion && currentRsi < 32 && currentPrice <= currentBb.lower) {
      signal = 'BUY'; stopLoss = Math.round((currentBb.lower - 1.5 * currentAtr) * 100) / 100; takeProfit = currentBb.middle;
      rationale = `Mean-reversion entry: RSI ${currentRsi.toFixed(1)}, lower Bollinger Band touched in ${indicators.marketRegime}.`;
    } else if (regimeAllowsMeanReversion && currentRsi > 68 && currentPrice >= currentBb.upper) {
      signal = 'SELL'; stopLoss = Math.round((currentBb.upper + 1.5 * currentAtr) * 100) / 100; takeProfit = currentBb.middle;
      rationale = `Mean-reversion short: RSI ${currentRsi.toFixed(1)}, upper Bollinger Band touched in ${indicators.marketRegime}.`;
    } else { signal = 'HOLD'; rationale = `Mean-reversion conditions not fully satisfied (Regime: ${indicators.marketRegime}, RSI: ${currentRsi.toFixed(1)}).`; }
  } else if (strategy.id === 'BO_VOLATILITY_SQUEEZE') {
    const priorBandwidths = bollinger
      .slice(Math.max(0, currentIndex - 10), currentIndex)
      .map((band) => band.bandwidth)
      .filter(Number.isFinite);
    const sortedBandwidths = [...priorBandwidths].sort((a, b) => a - b);
    const percentile20 = sortedBandwidths[Math.max(0, Math.floor((sortedBandwidths.length - 1) * 0.2))] ?? Number.POSITIVE_INFINITY;
    const compressedBars = priorBandwidths.filter((bandwidth) => bandwidth <= percentile20 || bandwidth < 0.035).length;
    const compressionWindow = priorBandwidths.length >= 10 && compressedBars >= 10;
    const previousBandwidth = bollinger[currentIndex - 1]?.bandwidth ?? 0;
    const expansionAfterCompression = currentBb.bandwidth > Math.max(0.035, previousBandwidth);
    const expansionCandle = currentIndex > 0 && currentPrice > bars[currentIndex - 1].close;
    if (compressionWindow && expansionAfterCompression && currentPrice > currentBb.upper && currentRelativeVolume > 1.5 && expansionCandle) {
      const breakoutRange = Math.max(currentAtr, bars[currentIndex].high - bars[currentIndex].low);
      signal = 'BUY'; stopLoss = Math.round((bars[currentIndex].low - 0.1 * currentAtr) * 100) / 100; takeProfit = Math.round((currentPrice + 2.5 * breakoutRange) * 100) / 100;
      rationale = `Bollinger squeeze compressed for 10 bars, then bandwidth expanded with an upper-band breakout and ${currentRelativeVolume}x volume.`;
    } else rationale = 'Volatility squeeze, post-compression expansion, breakout, and high-volume confirmation are not all active.';
  } else if (strategy.id === 'MOM_MACD_HIST') {
    const macd12 = calculateEMA(closes, 12);
    const macd26 = calculateEMA(closes, 26);
    const macdDiffs = macd12.map((value, index) => value - macd26[index]);
    const signalLine = calculateEMA(macdDiffs, 9);
    const histogramSeries = macdDiffs.map((value, index) => value - signalLine[index]);
    const accelerated = currentIndex >= 2 && histogramSeries[currentIndex] > 0 && histogramSeries[currentIndex] > histogramSeries[currentIndex - 1] && histogramSeries[currentIndex] > histogramSeries[currentIndex - 2];
    if (accelerated && currentRsi > 48 && currentRsi < 65 && currentPrice > currentEma50) {
      signal = 'BUY'; stopLoss = Math.round((currentPrice - 1.8 * currentAtr) * 100) / 100; takeProfit = Math.round((currentPrice + 3.0 * currentAtr) * 100) / 100;
      rationale = `MACD histogram acceleration above zero with RSI ${currentRsi.toFixed(1)} and price above EMA 50.`;
    } else rationale = `MACD acceleration or momentum filters not satisfied (histogram ${indicators.macd.histogram.toFixed(2)}).`;
  } else {
    signal = 'NO_TRADE';
    stopLoss = currentPrice;
    takeProfit = currentPrice;
    rationale = `Unsupported strategy ID "${strategy.id}". Strategy evaluation halted safely.`;
  }

  if (!Number.isFinite(stopLoss) || !Number.isFinite(takeProfit) || stopLoss <= 0 || takeProfit <= 0) {
    signal = 'NO_TRADE'; stopLoss = currentPrice; takeProfit = currentPrice; rationale = 'Calculated risk boundaries are invalid; strategy evaluation halted safely.';
  }

  const riskPerUnit = Math.abs(currentPrice - stopLoss);
  const rewardPerUnit = Math.abs(takeProfit - currentPrice);
  const riskRewardRatio = riskPerUnit > 0 ? Math.round((rewardPerUnit / riskPerUnit) * 100) / 100 : 0;
  return { strategyId: strategy.id, symbol, timestamp, signal, suggestedEntry: currentPrice, suggestedStopLoss: stopLoss, suggestedTakeProfit: takeProfit, riskRewardRatio, targetQuantity: signal === 'NO_TRADE' || signal === 'HOLD' ? 0 : 10, indicatorsSnapshot: indicators, rationale };
}
