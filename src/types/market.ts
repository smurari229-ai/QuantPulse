export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface InstrumentMetadata {
  symbol: string;
  name: string;
  assetClass: 'EQUITY' | 'INDEX' | 'CRYPTO' | 'FOREX' | 'COMMODITY';
  exchange: string;
  currency: string;
  lotSize: number;
  tickSize: number;
  marginRequirement: number;
  maxLeverage: number;
  tradingHours: {
    open: string;
    close: string;
    timezone: string;
  };
}

export interface MarketDataSnapshot {
  symbol: string;
  timestamp: number;
  lastPrice: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  change24h: number;
  dataQuality: {
    isStale: boolean;
    latencyMs: number;
    missingCandlesCount: number;
    isValidated: boolean;
    provider: string;
  };
}

export interface MarketValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  anomaliesDetected: {
    negativePrice: boolean;
    highLowInversion: boolean;
    zeroVolumeSpike: boolean;
    priceGapExceedsThreshold: boolean;
    staleTimestamp: boolean;
  };
}
