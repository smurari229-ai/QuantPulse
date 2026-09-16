import React, { useState, useMemo } from 'react';
import { OHLCV } from '../../types/market';
import { BacktestParameters, BacktestRunResult } from '../../types/backtest';
import { runFullBacktest } from '../../engines/backtestingLab';
import { FlaskConical, AlertTriangle, TrendingUp, Sliders, ShieldCheck, Play, Layers } from 'lucide-react';

interface BacktestingLabViewProps {
  bars: OHLCV[];
  symbol: string;
}

export const BacktestingLabView: React.FC<BacktestingLabViewProps> = ({ bars, symbol }) => {
  const [params, setParams] = useState<BacktestParameters>({
    strategyId: 'TF_EMA_CROSS',
    symbol,
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    initialCapital: 100000,
    slippageModel: 'FIXED_BPS',
    slippageBps: 5, // 5 bps = 0.05%
    commissionRatePct: 0.03, // 0.03%
    taxRatePct: 0.012, // 0.012% Indian STT / exchange charges
    outOfSampleSplitRatio: 0.30, // 30% out-of-sample
    enableWalkForward: true,
    walkForwardFolds: 3,
    positionSizingPct: 15, // 15% per trade
  });

  const [activeTab, setActiveTab] = useState<'metrics' | 'walk_forward' | 'trades'>('metrics');

  const backtestResult: BacktestRunResult = useMemo(() => {
    return runFullBacktest(bars, { ...params, symbol });
  }, [bars, params, symbol]);

  const { combinedMetrics, inSampleMetrics, outOfSampleMetrics, walkForwardResults, equityCurve, overfittingRiskAssessment } = backtestResult;

  // SVG Equity curve calculations
  const curveWidth = 720;
  const curveHeight = 220;
  const equities = equityCurve.map((e) => e.equity);
  const minEq = Math.min(...equities) * 0.99;
  const maxEq = Math.max(...equities) * 1.01;
  const eqRange = maxEq - minEq || 1;

  const points = equityCurve
    .map((d, i) => {
      const x = (i / Math.max(1, equityCurve.length - 1)) * curveWidth;
      const y = curveHeight - ((d.equity - minEq) / eqRange) * curveHeight;
      return `${x},${y}`;
    })
    .join(' ');

  const benchmarkPoints = equityCurve
    .map((d, i) => {
      const x = (i / Math.max(1, equityCurve.length - 1)) * curveWidth;
      const y = curveHeight - ((d.benchmarkEquity - minEq) / eqRange) * curveHeight;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <FlaskConical className="w-5 h-5 text-purple-400" />
            <h2 className="text-sm font-semibold text-slate-100">Quantitative Backtesting Lab & Walk-Forward Audit</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Zero look-ahead bias, realistic friction (brokerage + STT + slippage), out-of-sample holdout, and walk-forward overfitting checks.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className="text-slate-400">Overfitting Risk:</span>
          <span className={`px-2 py-0.5 rounded font-bold ${
            overfittingRiskAssessment === 'LOW'
              ? 'bg-emerald-950 border border-emerald-500 text-emerald-400'
              : overfittingRiskAssessment === 'MODERATE'
              ? 'bg-amber-950 border border-amber-500 text-amber-400'
              : 'bg-rose-950 border border-rose-500 text-rose-400'
          }`}>
            {overfittingRiskAssessment}
          </span>
        </div>
      </div>

      {/* Small Sample Warning Alert if applicable */}
      {combinedMetrics.sampleSizeWarning.isUnderSampled && (
        <div className="p-3.5 bg-amber-950/30 border border-amber-500/40 rounded-lg flex items-start space-x-3 text-xs text-amber-300 font-mono">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">RULE 17 COMPLIANCE NOTICE: SMALL SAMPLE SIZE WARNING</span>
            <span>{combinedMetrics.sampleSizeWarning.warningMessage}</span>
          </div>
        </div>
      )}

      {/* Parameters Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-800 pb-2 text-xs font-mono font-bold text-slate-300">
          <Sliders className="w-4 h-4 text-blue-400" />
          <span>SIMULATION PARAMETERS & FRICTION MODELING</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 font-mono text-xs">
          <div>
            <label className="text-slate-400 text-[10px] block mb-1">STRATEGY</label>
            <select
              value={params.strategyId}
              onChange={(e) => setParams({ ...params, strategyId: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="TF_EMA_CROSS">Trend Following (EMA)</option>
              <option value="MR_RSI_BOLLINGER">Mean Reversion (RSI/BB)</option>
              <option value="BO_VOLATILITY_SQUEEZE">Volatility Breakout</option>
              <option value="MOM_MACD_HIST">MACD Momentum</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 text-[10px] block mb-1">SLIPPAGE (BPS)</label>
            <input
              type="number"
              value={params.slippageBps}
              onChange={(e) => setParams({ ...params, slippageBps: Math.max(0, Number(e.target.value)) })}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-400 text-[10px] block mb-1">BROKERAGE (%)</label>
            <input
              type="number"
              step="0.01"
              value={params.commissionRatePct}
              onChange={(e) => setParams({ ...params, commissionRatePct: Math.max(0, Number(e.target.value)) })}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-400 text-[10px] block mb-1">TAX / STT (%)</label>
            <input
              type="number"
              step="0.005"
              value={params.taxRatePct}
              onChange={(e) => setParams({ ...params, taxRatePct: Math.max(0, Number(e.target.value)) })}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-slate-400 text-[10px] block mb-1">OUT-OF-SAMPLE (%)</label>
            <select
              value={params.outOfSampleSplitRatio}
              onChange={(e) => setParams({ ...params, outOfSampleSplitRatio: Number(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            >
              <option value={0.20}>20% Out-of-Sample</option>
              <option value={0.30}>30% Out-of-Sample</option>
              <option value={0.40}>40% Out-of-Sample</option>
            </select>
          </div>

          <div>
            <label className="text-slate-400 text-[10px] block mb-1">POSITION SIZING (%)</label>
            <input
              type="number"
              value={params.positionSizingPct}
              onChange={(e) => setParams({ ...params, positionSizingPct: Math.max(1, Number(e.target.value)) })}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* SVG Equity Curve Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex justify-between items-center text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-200">STRATEGY EQUITY CURVE VS BUY & HOLD BENCHMARK</span>
            <span className="text-slate-500">| Net of All Fees & Slippage</span>
          </div>
          <div className="flex items-center space-x-4 text-[11px]">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-blue-400 inline-block" />
              <span className="text-blue-400 font-semibold">Strategy Net Equity</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-slate-500 inline-block" />
              <span className="text-slate-400">Buy & Hold Benchmark</span>
            </span>
          </div>
        </div>

        <div className="w-full overflow-x-auto bg-slate-950/80 rounded border border-slate-800/80 p-2">
          <svg viewBox={`0 0 ${curveWidth} ${curveHeight}`} className="w-full h-56 block select-none">
            {/* Horizontal Grid */}
            {[0.25, 0.5, 0.75].map((pct) => {
              const y = curveHeight * pct;
              const val = maxEq - pct * eqRange;
              return (
                <g key={pct}>
                  <line x1="0" y1={y} x2={curveWidth} y2={y} stroke="#1e293b" strokeDasharray="3 3" />
                  <text x={curveWidth - 65} y={y - 4} fill="#64748b" fontSize="9" fontFamily="monospace">
                    ${Math.round(val).toLocaleString()}
                  </text>
                </g>
              );
            })}

            {/* Benchmark Polyline */}
            <polyline fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 4" points={benchmarkPoints} />

            {/* Strategy Polyline */}
            <polyline fill="none" stroke="#3b82f6" strokeWidth="2.2" points={points} />
          </svg>
        </div>
      </div>

      {/* Tabs for Metrics / Walk-Forward / Trades */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-950/40 border-b border-slate-800 flex space-x-4 text-xs font-mono">
          <button
            onClick={() => setActiveTab('metrics')}
            className={`pb-1 border-b-2 font-semibold ${
              activeTab === 'metrics' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Quantitative Metrics Comparison
          </button>
          <button
            onClick={() => setActiveTab('walk_forward')}
            className={`pb-1 border-b-2 font-semibold ${
              activeTab === 'walk_forward' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Walk-Forward Degradation (3 Folds)
          </button>
          <button
            onClick={() => setActiveTab('trades')}
            className={`pb-1 border-b-2 font-semibold ${
              activeTab === 'trades' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Executed Trades ({backtestResult.trades.length})
          </button>
        </div>

        <div className="p-4">
          {activeTab === 'metrics' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="px-4 py-2.5">METRIC</th>
                    <th className="px-4 py-2.5 text-indigo-400">IN-SAMPLE (70%)</th>
                    <th className="px-4 py-2.5 text-blue-400">OUT-OF-SAMPLE (30%)</th>
                    <th className="px-4 py-2.5 text-slate-200">COMBINED RUN</th>
                    <th className="px-4 py-2.5 text-slate-400">TARGET BENCHMARK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr>
                    <td className="px-4 py-2 font-semibold">Sharpe Ratio</td>
                    <td className="px-4 py-2">{inSampleMetrics.sharpeRatio}</td>
                    <td className="px-4 py-2 font-bold text-blue-300">{outOfSampleMetrics.sharpeRatio}</td>
                    <td className="px-4 py-2 font-bold">{combinedMetrics.sharpeRatio}</td>
                    <td className="px-4 py-2 text-slate-400">&gt; 1.50</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-semibold">Sortino Ratio</td>
                    <td className="px-4 py-2">{inSampleMetrics.sortinoRatio}</td>
                    <td className="px-4 py-2 font-bold text-blue-300">{outOfSampleMetrics.sortinoRatio}</td>
                    <td className="px-4 py-2 font-bold">{combinedMetrics.sortinoRatio}</td>
                    <td className="px-4 py-2 text-slate-400">&gt; 2.00</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-semibold">Maximum Drawdown</td>
                    <td className="px-4 py-2 text-rose-400">-{inSampleMetrics.maxDrawdownPct}%</td>
                    <td className="px-4 py-2 text-rose-400 font-bold">-{outOfSampleMetrics.maxDrawdownPct}%</td>
                    <td className="px-4 py-2 text-rose-400 font-bold">-{combinedMetrics.maxDrawdownPct}%</td>
                    <td className="px-4 py-2 text-slate-400">&lt; 10.0%</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-semibold">Win Rate</td>
                    <td className="px-4 py-2">{inSampleMetrics.winRatePct}%</td>
                    <td className="px-4 py-2 font-bold text-blue-300">{outOfSampleMetrics.winRatePct}%</td>
                    <td className="px-4 py-2 font-bold">{combinedMetrics.winRatePct}%</td>
                    <td className="px-4 py-2 text-slate-400">&gt; 50.0%</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-semibold">Profit Factor</td>
                    <td className="px-4 py-2">{inSampleMetrics.profitFactor}</td>
                    <td className="px-4 py-2 font-bold text-blue-300">{outOfSampleMetrics.profitFactor}</td>
                    <td className="px-4 py-2 font-bold">{combinedMetrics.profitFactor}</td>
                    <td className="px-4 py-2 text-slate-400">&gt; 1.60</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-semibold">Net P&L ($)</td>
                    <td className="px-4 py-2 text-emerald-400">+${inSampleMetrics.netProfit.toFixed(2)}</td>
                    <td className="px-4 py-2 text-emerald-400 font-bold">+${outOfSampleMetrics.netProfit.toFixed(2)}</td>
                    <td className="px-4 py-2 text-emerald-400 font-bold">+${combinedMetrics.netProfit.toFixed(2)}</td>
                    <td className="px-4 py-2 text-slate-400">Positive Net</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-semibold">Total Slippage Cost Paid</td>
                    <td className="px-4 py-2 text-slate-400">${inSampleMetrics.totalSlippageCost.toFixed(2)}</td>
                    <td className="px-4 py-2 text-slate-400">${outOfSampleMetrics.totalSlippageCost.toFixed(2)}</td>
                    <td className="px-4 py-2 text-slate-300 font-bold">${combinedMetrics.totalSlippageCost.toFixed(2)}</td>
                    <td className="px-4 py-2 text-slate-400">Friction Modeled</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2 font-semibold">Brokerage & STT Taxes Paid</td>
                    <td className="px-4 py-2 text-slate-400">${inSampleMetrics.totalFeesPaid.toFixed(2)}</td>
                    <td className="px-4 py-2 text-slate-400">${outOfSampleMetrics.totalFeesPaid.toFixed(2)}</td>
                    <td className="px-4 py-2 text-slate-300 font-bold">${combinedMetrics.totalFeesPaid.toFixed(2)}</td>
                    <td className="px-4 py-2 text-slate-400">Friction Modeled</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'walk_forward' && (
            <div className="space-y-4 font-mono text-xs">
              <p className="text-slate-400">
                Walk-forward analysis splits the timeline into non-overlapping training and forward testing slices. If the degradation ratio drops below 0.50, overfitting is identified.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="px-4 py-2">FOLD</th>
                      <th className="px-4 py-2">TRAIN PERIOD</th>
                      <th className="px-4 py-2">FORWARD TEST</th>
                      <th className="px-4 py-2">TRAIN SHARPE</th>
                      <th className="px-4 py-2">FORWARD SHARPE</th>
                      <th className="px-4 py-2">DEGRADATION RATIO</th>
                      <th className="px-4 py-2">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {walkForwardResults.map((wf) => (
                      <tr key={wf.foldIndex}>
                        <td className="px-4 py-2 font-bold">Fold #{wf.foldIndex}</td>
                        <td className="px-4 py-2 text-slate-400">{wf.inSampleRange.start} → {wf.inSampleRange.end}</td>
                        <td className="px-4 py-2 text-slate-300">{wf.outOfSampleRange.start} → {wf.outOfSampleRange.end}</td>
                        <td className="px-4 py-2">{wf.inSampleSharpe}</td>
                        <td className="px-4 py-2 font-semibold text-blue-300">{wf.outOfSampleSharpe}</td>
                        <td className="px-4 py-2 font-bold">{wf.degradationRatio}</td>
                        <td className="px-4 py-2">
                          {wf.degradationRatio >= 0.70 ? (
                            <span className="text-emerald-400 font-bold">PASS (Robust)</span>
                          ) : wf.degradationRatio >= 0.45 ? (
                            <span className="text-amber-400 font-bold">ACCEPTABLE</span>
                          ) : (
                            <span className="text-rose-400 font-bold">DEGRADED</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'trades' && (
            <div className="overflow-x-auto max-h-72">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px] sticky top-0">
                  <tr>
                    <th className="px-4 py-2">TRADE ID</th>
                    <th className="px-4 py-2">SAMPLE</th>
                    <th className="px-4 py-2">ENTRY</th>
                    <th className="px-4 py-2">EXIT</th>
                    <th className="px-4 py-2">QTY</th>
                    <th className="px-4 py-2">RETURN %</th>
                    <th className="px-4 py-2">NET P&L</th>
                    <th className="px-4 py-2">REASON</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {backtestResult.trades.map((t) => {
                    const isWin = t.netPnL > 0;
                    return (
                      <tr key={t.tradeId} className="hover:bg-slate-800/40">
                        <td className="px-4 py-2 font-bold">{t.tradeId}</td>
                        <td className="px-4 py-2 text-[10px] text-slate-400">{t.isOutOfSample ? 'OUT-OF-SAMPLE' : 'IN-SAMPLE'}</td>
                        <td className="px-4 py-2">${t.entryPrice.toFixed(2)}</td>
                        <td className="px-4 py-2">${t.exitPrice.toFixed(2)}</td>
                        <td className="px-4 py-2">{t.quantity}</td>
                        <td className={`px-4 py-2 font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isWin ? '+' : ''}{t.returnPct}%
                        </td>
                        <td className={`px-4 py-2 font-bold ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isWin ? '+' : ''}${t.netPnL.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-[10px] text-slate-400">{t.exitReason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
