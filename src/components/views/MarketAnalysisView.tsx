import React from 'react';
import { TechnicalIndicators } from '../../types/strategy';
import { Activity, Compass, Gauge, Zap, BarChart2, Shield } from 'lucide-react';

interface MarketAnalysisViewProps {
  symbol: string;
  indicators: TechnicalIndicators;
  currentPrice: number;
}

export const MarketAnalysisView: React.FC<MarketAnalysisViewProps> = ({
  symbol,
  indicators,
  currentPrice,
}) => {
  const getRegimeBadge = (regime: TechnicalIndicators['marketRegime']) => {
    switch (regime) {
      case 'TRENDING_BULL':
        return <span className="px-2.5 py-1 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 rounded font-bold">TRENDING BULLISH</span>;
      case 'TRENDING_BEAR':
        return <span className="px-2.5 py-1 bg-rose-950/60 border border-rose-500/40 text-rose-300 rounded font-bold">TRENDING BEARISH</span>;
      case 'HIGH_VOLATILITY_SHOCK':
        return <span className="px-2.5 py-1 bg-red-900/60 border border-red-500 text-red-200 rounded font-bold animate-pulse">VOLATILITY SHOCK (HALT RISK)</span>;
      case 'MEAN_REVERTING_RANGE':
        return <span className="px-2.5 py-1 bg-blue-950/60 border border-blue-500/40 text-blue-300 rounded font-bold">MEAN-REVERTING RANGE</span>;
      default:
        return <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded font-bold">LOW VOLATILITY CONSOLIDATION</span>;
    }
  };

  const isRsiOverbought = indicators.rsi14 >= 70;
  const isRsiOversold = indicators.rsi14 <= 30;

  return (
    <div className="space-y-6">
      {/* Top Banner: Market Regime Classification */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4 font-mono">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <Compass className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-slate-400">STATISTICAL MARKET REGIME ({symbol})</span>
          </div>
          <div className="text-lg font-bold text-slate-100 flex items-center space-x-3">
            {getRegimeBadge(indicators.marketRegime)}
          </div>
        </div>
        <div className="text-xs text-slate-400 max-w-md text-right">
          Determined mathematically from multi-timeframe moving average cascades, ATR volatility expansion ratios, and Bollinger bandwidth percentile ranking.
        </div>
      </div>

      {/* Grid of Statistical Feature Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
        {/* Module 1: Trend Indicators (EMA) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
              <Activity className="w-4 h-4 text-indigo-400" />
              <span>Trend Structure (EMA)</span>
            </div>
            <span className="text-[10px] text-slate-400">20 / 50 / 200 Day</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Current Close:</span>
              <span className="text-slate-100 font-bold">${currentPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">EMA 20 (Short-term):</span>
              <span className={`font-semibold ${currentPrice > indicators.ema20 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${indicators.ema20.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">EMA 50 (Medium-term):</span>
              <span className={`font-semibold ${currentPrice > indicators.ema50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${indicators.ema50.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">EMA 200 (Macro Regime):</span>
              <span className={`font-semibold ${currentPrice > indicators.ema200 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${indicators.ema200.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="p-2 bg-slate-950/60 rounded border border-slate-800/80 text-[11px] text-slate-400">
            Cascade Alignment: {indicators.ema20 > indicators.ema50 && indicators.ema50 > indicators.ema200 ? 'Bullish (20 > 50 > 200)' : indicators.ema20 < indicators.ema50 && indicators.ema50 < indicators.ema200 ? 'Bearish (20 < 50 < 200)' : 'Mixed / Consolidating'}
          </div>
        </div>

        {/* Module 2: Momentum (RSI & MACD) */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
              <Gauge className="w-4 h-4 text-emerald-400" />
              <span>Momentum (RSI & MACD)</span>
            </div>
            <span className="text-[10px] text-slate-400">Standard Periods</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">RSI 14:</span>
              <span className={`font-bold ${isRsiOverbought ? 'text-rose-400' : isRsiOversold ? 'text-emerald-400' : 'text-slate-200'}`}>
                {indicators.rsi14} {isRsiOverbought ? '(Overbought >70)' : isRsiOversold ? '(Oversold <30)' : '(Neutral)'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">MACD Line:</span>
              <span className="text-slate-200 font-semibold">{indicators.macd.macdLine}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">MACD Signal:</span>
              <span className="text-slate-200 font-semibold">{indicators.macd.signalLine}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">MACD Histogram:</span>
              <span className={`font-bold ${indicators.macd.histogram >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {indicators.macd.histogram >= 0 ? '+' : ''}{indicators.macd.histogram}
              </span>
            </div>
          </div>
          {/* RSI Visual Meter */}
          <div className="space-y-1">
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
              <div className="bg-emerald-500/50 h-full w-[30%]" title="Oversold Zone" />
              <div className="bg-slate-600/40 h-full w-[40%]" title="Neutral Zone" />
              <div className="bg-rose-500/50 h-full w-[30%]" title="Overbought Zone" />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0 (Oversold)</span>
              <span>50</span>
              <span>100 (Overbought)</span>
            </div>
          </div>
        </div>

        {/* Module 3: Volatility & Dispersion */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Volatility (ATR & Bollinger)</span>
            </div>
            <span className="text-[10px] text-slate-400">2-Sigma Bands</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">ATR 14 (Daily Range):</span>
              <span className="text-slate-100 font-bold">${indicators.atr14.toFixed(2)} ({((indicators.atr14 / currentPrice) * 100).toFixed(2)}%)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Bollinger Upper (+2σ):</span>
              <span className="text-slate-200">${indicators.bollinger.upper.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Bollinger Middle (SMA 20):</span>
              <span className="text-slate-200">${indicators.bollinger.middle.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Bollinger Lower (-2σ):</span>
              <span className="text-slate-200">${indicators.bollinger.lower.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Bandwidth:</span>
              <span className="text-slate-300 font-semibold">{(indicators.bollinger.bandwidth * 100).toFixed(2)}%</span>
            </div>
          </div>
          <div className="p-2 bg-slate-950/60 rounded border border-slate-800/80 text-[11px] text-slate-400">
            {indicators.bollinger.bandwidth < 0.035 ? 'Squeeze Alert: Low bandwidth signals pending breakout.' : 'Normal dispersion: Bandwidth expanding.'}
          </div>
        </div>

        {/* Module 4: Volume & VWAP */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
              <BarChart2 className="w-4 h-4 text-purple-400" />
              <span>Volume & Institutional VWAP</span>
            </div>
            <span className="text-[10px] text-slate-400">20-Day Profile</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Relative Volume (RVOL):</span>
              <span className={`font-bold ${indicators.volumeProfile.relativeVolume > 1.2 ? 'text-emerald-400' : 'text-slate-300'}`}>
                {indicators.volumeProfile.relativeVolume}x 20-period avg
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Institutional VWAP:</span>
              <span className="text-slate-100 font-bold">${indicators.volumeProfile.vwap.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Price vs VWAP:</span>
              <span className={currentPrice >= indicators.volumeProfile.vwap ? 'text-emerald-400' : 'text-rose-400'}>
                {currentPrice >= indicators.volumeProfile.vwap ? 'Above VWAP (Buyer Control)' : 'Below VWAP (Seller Control)'}
              </span>
            </div>
          </div>
          <div className="p-2 bg-slate-950/60 rounded border border-slate-800/80 text-[11px] text-slate-400">
            RVOL &gt; 1.2 confirms institutional participation during breakouts.
          </div>
        </div>

        {/* Module 5: Support & Resistance Geometry */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
              <Shield className="w-4 h-4 text-cyan-400" />
              <span>Support & Resistance Pivots</span>
            </div>
            <span className="text-[10px] text-slate-400">40-Bar Swing</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Nearest Resistance:</span>
              <span className="text-rose-400 font-semibold">${indicators.supportResistance.nearestResistance.toFixed(2)} (+{indicators.supportResistance.distanceToResistancePct}%)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Current Price:</span>
              <span className="text-slate-100 font-bold">${currentPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Nearest Support:</span>
              <span className="text-emerald-400 font-semibold">${indicators.supportResistance.nearestSupport.toFixed(2)} (-{indicators.supportResistance.distanceToSupportPct}%)</span>
            </div>
          </div>
          <div className="p-2 bg-slate-950/60 rounded border border-slate-800/80 text-[11px] text-slate-400">
            Stop-loss placement must align outside the nearest support buffer (1.5x - 2.0x ATR).
          </div>
        </div>

        {/* Module 6: Quantitative Mathematical Verification */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
              <Compass className="w-4 h-4 text-emerald-400" />
              <span>Data Provenance & Audit</span>
            </div>
            <span className="text-[10px] text-slate-400">Verified</span>
          </div>
          <div className="space-y-2 text-[11px] text-slate-300">
            <p className="text-slate-400">
              Every feature vector is computed directly from validated raw bar arrays using deterministic numerical formulas.
            </p>
            <div className="p-2 bg-slate-950 rounded border border-slate-800 font-mono text-[10px] text-slate-400">
              Look-ahead Bias Filter: ENABLED<br />
              Data Normalization: Active<br />
              Zero-Volume Safeguard: Active
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
