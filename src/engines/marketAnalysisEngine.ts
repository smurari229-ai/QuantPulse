import { OHLCV } from '../types/market';
import { TechnicalIndicators } from '../types/strategy';

// Exponential Moving Average
export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const emaValues: number[] = [values[0]];

  for (let i = 1; i < values.length; i++) {
    const val = values[i] * k + emaValues[i - 1] * (1 - k);
    emaValues.push(val);
  }
  return emaValues;
}

// Relative Strength Index (14)
export function calculateRSI(closes: number[], period = 14): number[] {
  if (closes.length <= period) return new Array(closes.length).fill(50);
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = 0; i < period; i++) {
    rsi.push(50);
  }

  const initialRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi.push(100 - (100 / (1 + initialRs)));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }

  return rsi;
}

// Average True Range (ATR 14)
export function calculateATR(bars: OHLCV[], period = 14): number[] {
  if (bars.length === 0) return [];
  const trueRanges: number[] = [bars[0].high - bars[0].low];

  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trueRanges.push(tr);
  }

  return calculateEMA(trueRanges, period);
}

// Bollinger Bands (20 periods, 2 std dev)
export function calculateBollingerBands(closes: number[], period = 20, multiplier = 2) {
  const bands: { upper: number; middle: number; lower: number; bandwidth: number }[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      bands.push({ upper: closes[i], middle: closes[i], lower: closes[i], bandwidth: 0 });
      continue;
    }

    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upper = mean + multiplier * stdDev;
    const lower = mean - multiplier * stdDev;
    const bandwidth = mean > 0 ? (upper - lower) / mean : 0;

    bands.push({
      upper: Math.round(upper * 100) / 100,
      middle: Math.round(mean * 100) / 100,
      lower: Math.round(lower * 100) / 100,
      bandwidth: Math.round(bandwidth * 10000) / 10000,
    });
  }

  return bands;
}

// Full indicator analysis on historical dataset
export function analyzeMarketFeatures(bars: OHLCV[]): TechnicalIndicators {
  if (bars.length < 20) {
    const fallbackPrice = bars.length > 0 ? bars[bars.length - 1].close : 100;
    return {
      ema20: fallbackPrice,
      ema50: fallbackPrice,
      ema200: fallbackPrice,
      rsi14: 50,
      macd: { macdLine: 0, signalLine: 0, histogram: 0 },
      bollinger: { upper: fallbackPrice * 1.02, middle: fallbackPrice, lower: fallbackPrice * 0.98, bandwidth: 0.04 },
      atr14: fallbackPrice * 0.015,
      volumeProfile: { relativeVolume: 1.0, vwap: fallbackPrice },
      supportResistance: {
        nearestSupport: fallbackPrice * 0.97,
        nearestResistance: fallbackPrice * 1.03,
        distanceToSupportPct: 3.0,
        distanceToResistancePct: 3.0,
      },
      marketRegime: 'LOW_VOLATILITY_CONSOLIDATION',
    };
  }

  const closes = bars.map((b) => b.close);
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema200Arr = calculateEMA(closes, Math.min(200, closes.length));
  const rsiArr = calculateRSI(closes, 14);
  const atrArr = calculateATR(bars, 14);
  const bbArr = calculateBollingerBands(closes, 20, 2);

  const lastIdx = bars.length - 1;
  const currentClose = closes[lastIdx];
  const ema20 = ema20Arr[lastIdx];
  const ema50 = ema50Arr[lastIdx];
  const ema200 = ema200Arr[lastIdx];
  const rsi14 = Math.round(rsiArr[lastIdx] * 10) / 10;
  const atr14 = Math.round(atrArr[lastIdx] * 100) / 100;
  const bb = bbArr[lastIdx];

  // MACD calculation
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12[lastIdx] - ema26[lastIdx];
  const macdDiffs = ema12.map((val, idx) => val - ema26[idx]);
  const signalArr = calculateEMA(macdDiffs, 9);
  const signalLine = signalArr[lastIdx];
  const histogram = Math.round((macdLine - signalLine) * 100) / 100;

  // Volume & VWAP
  const recentBars = bars.slice(-20);
  const totalVol = recentBars.reduce((sum, b) => sum + b.volume, 0);
  const avgVol = totalVol / recentBars.length;
  const lastVol = bars[lastIdx].volume;
  const relativeVolume = avgVol > 0 ? Math.round((lastVol / avgVol) * 100) / 100 : 1.0;

  const cumPv = recentBars.reduce((sum, b) => sum + ((b.high + b.low + b.close) / 3) * b.volume, 0);
  const vwap = totalVol > 0 ? Math.round((cumPv / totalVol) * 100) / 100 : currentClose;

  // Support & Resistance based on local 30-bar swing pivots
  const lookbackSlice = bars.slice(-40);
  const localLows = lookbackSlice.map((b) => b.low);
  const localHighs = lookbackSlice.map((b) => b.high);
  const nearestSupport = Math.min(...localLows.filter((p) => p < currentClose)) || currentClose * 0.98;
  const nearestResistance = Math.max(...localHighs.filter((p) => p > currentClose)) || currentClose * 1.02;

  const distSuppPct = Math.round((Math.abs(currentClose - nearestSupport) / currentClose) * 1000) / 10;
  const distResPct = Math.round((Math.abs(nearestResistance - currentClose) / currentClose) * 1000) / 10;

  // Statistical Regime Classifier
  let marketRegime: TechnicalIndicators['marketRegime'] = 'LOW_VOLATILITY_CONSOLIDATION';
  const isAtrElevated = atr14 / currentClose > 0.025;

  if (isAtrElevated) {
    marketRegime = 'HIGH_VOLATILITY_SHOCK';
  } else if (currentClose > ema50 && ema20 > ema50 && ema50 > ema200) {
    marketRegime = 'TRENDING_BULL';
  } else if (currentClose < ema50 && ema20 < ema50 && ema50 < ema200) {
    marketRegime = 'TRENDING_BEAR';
  } else if (bb.bandwidth < 0.035) {
    marketRegime = 'LOW_VOLATILITY_CONSOLIDATION';
  } else {
    marketRegime = 'MEAN_REVERTING_RANGE';
  }

  return {
    ema20: Math.round(ema20 * 100) / 100,
    ema50: Math.round(ema50 * 100) / 100,
    ema200: Math.round(ema200 * 100) / 100,
    rsi14,
    macd: {
      macdLine: Math.round(macdLine * 100) / 100,
      signalLine: Math.round(signalLine * 100) / 100,
      histogram,
    },
    bollinger: bb,
    atr14,
    volumeProfile: {
      relativeVolume,
      vwap,
    },
    supportResistance: {
      nearestSupport: Math.round(nearestSupport * 100) / 100,
      nearestResistance: Math.round(nearestResistance * 100) / 100,
      distanceToSupportPct: distSuppPct,
      distanceToResistancePct: distResPct,
    },
    marketRegime,
  };
}

export const computeAllIndicators = analyzeMarketFeatures;
