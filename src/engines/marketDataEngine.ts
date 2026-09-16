import { OHLCV, InstrumentMetadata, MarketDataSnapshot, MarketValidationResult } from '../types/market';

export const SUPPORTED_INSTRUMENTS: InstrumentMetadata[] = [
  {
    symbol: 'NIFTY50',
    name: 'Nifty 50 Index Basket',
    assetClass: 'INDEX',
    exchange: 'NSE',
    currency: 'INR',
    lotSize: 25,
    tickSize: 0.05,
    marginRequirement: 0.20,
    maxLeverage: 5,
    tradingHours: { open: '09:15', close: '15:30', timezone: 'Asia/Kolkata' },
  },
  {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Ltd.',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    currency: 'INR',
    lotSize: 1,
    tickSize: 0.05,
    marginRequirement: 0.25,
    maxLeverage: 4,
    tradingHours: { open: '09:15', close: '15:30', timezone: 'Asia/Kolkata' },
  },
  {
    symbol: 'TCS',
    name: 'Tata Consultancy Services',
    assetClass: 'EQUITY',
    exchange: 'NSE',
    currency: 'INR',
    lotSize: 1,
    tickSize: 0.05,
    marginRequirement: 0.25,
    maxLeverage: 4,
    tradingHours: { open: '09:15', close: '15:30', timezone: 'Asia/Kolkata' },
  },
  {
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    assetClass: 'EQUITY',
    exchange: 'NYSE',
    currency: 'USD',
    lotSize: 1,
    tickSize: 0.01,
    marginRequirement: 0.25,
    maxLeverage: 4,
    tradingHours: { open: '09:30', close: '16:00', timezone: 'America/New_York' },
  },
  {
    symbol: 'BTC-USD',
    name: 'Bitcoin / US Dollar',
    assetClass: 'CRYPTO',
    exchange: 'COINBASE',
    currency: 'USD',
    lotSize: 0.001,
    tickSize: 0.1,
    marginRequirement: 0.50,
    maxLeverage: 2,
    tradingHours: { open: '00:00', close: '23:59', timezone: 'UTC' },
  },
];

// Deterministic synthetic historical generator based on Geometric Brownian Motion + Mean-reverting drift
export function generateRealisticHistoricalOHLCV(
  symbol: string,
  daysCount = 120,
  basePrice?: number,
  volatility = 0.015
): OHLCV[] {
  const defaults: Record<string, number> = {
    NIFTY50: 24850.0,
    RELIANCE: 2940.0,
    TCS: 4280.0,
    SPY: 565.0,
    'BTC-USD': 64200.0,
  };

  let price = basePrice || defaults[symbol] || 1000.0;
  const bars: OHLCV[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const startTime = now - daysCount * dayMs;

  let currentDrift = 0.0003;

  for (let i = 0; i < daysCount; i++) {
    const timestamp = startTime + i * dayMs;
    if (i % 25 === 0) {
      currentDrift = (Math.sin(i / 10) * 0.001);
    }

    const shock = (Math.sin(i * 1.7) * 0.5 + Math.cos(i * 0.8) * 0.5) * volatility;
    const dailyReturn = currentDrift + shock;
    const open = Math.round(price * 100) / 100;
    const close = Math.round((open * (1 + dailyReturn)) * 100) / 100;

    const intradayRange = Math.abs(open * volatility * 1.8);
    const high = Math.round((Math.max(open, close) + intradayRange * 0.6) * 100) / 100;
    const low = Math.round((Math.min(open, close) - intradayRange * 0.4) * 100) / 100;
    const volume = Math.floor(500000 + Math.abs(Math.sin(i)) * 1200000 + (Math.abs(dailyReturn) / volatility) * 400000);

    bars.push({ timestamp, open, high, low, close, volume });
    price = close;
  }

  return bars;
}

// Data validation engine to prevent garbage or malicious data feeds
export function validateMarketDataSeries(bars: OHLCV[]): MarketValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let negativePrice = false;
  let highLowInversion = false;
  let zeroVolumeSpike = false;
  let priceGapExceedsThreshold = false;
  let staleTimestamp = false;

  if (!Array.isArray(bars) || bars.length === 0) {
    return {
      isValid: false,
      errors: ['Market data series is empty or undefined'],
      warnings: [],
      anomaliesDetected: {
        negativePrice: true,
        highLowInversion: false,
        zeroVolumeSpike: false,
        priceGapExceedsThreshold: false,
        staleTimestamp: true,
      },
    };
  }

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const valuesAreFinite = [bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume]
      .every(Number.isFinite);

    if (!valuesAreFinite) {
      errors.push(`Bar #${i}: Non-finite timestamp, price, or volume value detected.`);
      staleTimestamp ||= !Number.isFinite(bar.timestamp);
      negativePrice ||= [bar.open, bar.high, bar.low, bar.close].some((value) => !Number.isFinite(value) || value <= 0);
      continue;
    }

    if (!Number.isInteger(bar.timestamp) || bar.timestamp <= 0) {
      staleTimestamp = true;
      errors.push(`Bar #${i}: Invalid timestamp (${bar.timestamp}).`);
    }

    if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0) {
      negativePrice = true;
      errors.push(`Bar #${i}: Non-positive price detected (Open=${bar.open}, Low=${bar.low}).`);
    }

    if (bar.high < bar.low || bar.open > bar.high || bar.close > bar.high || bar.open < bar.low || bar.close < bar.low) {
      highLowInversion = true;
      errors.push(`Bar #${i}: High/Low/Open/Close geometrical inversion detected (High=${bar.high}, Low=${bar.low}, Open=${bar.open}, Close=${bar.close}).`);
    }

    if (bar.volume <= 0 && bar.high !== bar.low) {
      zeroVolumeSpike = true;
      warnings.push(`Bar #${i}: Zero volume with nonzero price movement.`);
    }

    if (i > 0 && Number.isFinite(bars[i - 1].close) && bars[i - 1].close > 0) {
      const prevBar = bars[i - 1];
      const jumpPct = Math.abs(bar.open - prevBar.close) / prevBar.close;
      if (jumpPct > 0.20) {
        priceGapExceedsThreshold = true;
        warnings.push(`Bar #${i}: Extreme price jump of ${(jumpPct * 100).toFixed(1)}% between bars.`);
      }

      if (bar.timestamp <= prevBar.timestamp) {
        staleTimestamp = true;
        errors.push(`Bar #${i}: Non-chronological or duplicate timestamp (${bar.timestamp} <= ${prevBar.timestamp}).`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    anomaliesDetected: {
      negativePrice,
      highLowInversion,
      zeroVolumeSpike,
      priceGapExceedsThreshold,
      staleTimestamp,
    },
  };
}

// Live snapshot generator with simulated latency and bid/ask spread
export function getLiveSnapshot(
  symbol: string,
  lastClose: number,
  options?: { isStale?: boolean; latencyMs?: number; injectAnomaly?: boolean }
): MarketDataSnapshot {
  const spreadBps = 4;
  const halfSpread = (lastClose * spreadBps) / 20000;
  const bid = Math.round((lastClose - halfSpread) * 100) / 100;
  const ask = Math.round((lastClose + halfSpread) * 100) / 100;

  const latency = options?.latencyMs ?? (options?.isStale ? 6500 : 45);
  const isStale = options?.isStale ?? (latency > 3000);

  return {
    symbol,
    timestamp: Date.now() - (isStale ? 6500 : 45),
    lastPrice: options?.injectAnomaly ? lastClose * 1.5 : lastClose,
    bid,
    ask,
    bidSize: 450,
    askSize: 520,
    volume24h: 1420500,
    high24h: lastClose * 1.018,
    low24h: lastClose * 0.985,
    change24h: 0.85,
    dataQuality: {
      isStale,
      latencyMs: latency,
      missingCandlesCount: 0,
      isValidated: !options?.injectAnomaly && !isStale,
      provider: 'NSE_TICK_FEED_SIMULATOR',
    },
  };
}

export const generateSyntheticDailyBars = generateRealisticHistoricalOHLCV;
export const generateMarketSnapshot = getLiveSnapshot;
