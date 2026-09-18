import React from 'react';
import { PortfolioState } from '../../types/order';
import { RiskEngineConfig } from '../../types/risk';
import { ShieldCheck, TrendingUp, TrendingDown, DollarSign, PieChart as PieIcon, AlertCircle } from 'lucide-react';

interface PortfolioViewProps {
  portfolio: PortfolioState;
  riskConfig: RiskEngineConfig;
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({ portfolio, riskConfig }) => {
  const isPositiveDay = portfolio.dailyPnL >= 0;
  const maxExposure = riskConfig.maxPortfolioExposurePct;
  const exposureProgressPct = maxExposure > 0 ? Math.min(100, (portfolio.portfolioExposurePct / maxExposure) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Top metrics summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>TOTAL EQUITY</span>
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            ${portfolio.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center space-x-2">
            <span>Peak: ${portfolio.peakEquity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            <span className="text-slate-600">|</span>
            <span className="text-rose-400 font-mono">DD: {portfolio.currentDrawdownPct.toFixed(2)}%</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>DAILY P&L (SESSION)</span>
            {isPositiveDay ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div className={`text-2xl font-bold font-mono ${isPositiveDay ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositiveDay ? '+' : ''}${portfolio.dailyPnL.toFixed(2)} ({isPositiveDay ? '+' : ''}
            {portfolio.dailyPnLPct.toFixed(2)}%)
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Circuit breaker threshold: -{riskConfig.maxDailyLossPct.toFixed(2)}%
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>AVAILABLE CASH & MARGIN</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            ${portfolio.cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Used Margin: ${portfolio.marginUsed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>PORTFOLIO EXPOSURE</span>
            <PieIcon className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100 font-mono">
            {portfolio.portfolioExposurePct.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Exposure Limit: {maxExposure.toFixed(1)}% Max ({portfolio.positionsCount} active positions)
          </div>
        </div>
      </div>

      {/* Exposure Progress Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
        <div className="flex justify-between items-center text-xs font-mono text-slate-400 mb-2">
          <span>AGGREGATE RISK EXPOSURE</span>
          <span className="font-semibold text-slate-200">
            {portfolio.portfolioExposurePct.toFixed(1)}% / {maxExposure.toFixed(1)}% Max Allowed
          </span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${
              portfolio.portfolioExposurePct > maxExposure * 0.86
                ? 'bg-rose-500'
                : portfolio.portfolioExposurePct > maxExposure * 0.57
                ? 'bg-amber-500'
                : 'bg-blue-500'
            }`}
            style={{ width: `${exposureProgressPct}%` }}
          />
        </div>
      </div>

      {/* Active Positions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
          <div className="flex items-center space-x-2">
            <h3 className="text-sm font-semibold text-slate-100">Active Portfolio Positions</h3>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
              {portfolio.positions.length} Open
            </span>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Realized P&L: <span className={portfolio.totalRealizedPnL >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {portfolio.totalRealizedPnL >= 0 ? '+' : ''}${portfolio.totalRealizedPnL.toFixed(2)}
            </span>
          </div>
        </div>

        {portfolio.positions.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p>No active positions open.</p>
            <p className="text-slate-600 mt-1">Submit paper orders through the Paper Trading Console or trigger automated strategy signals.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="px-4 py-2.5">SYMBOL</th>
                  <th className="px-4 py-2.5">QTY</th>
                  <th className="px-4 py-2.5">AVG ENTRY</th>
                  <th className="px-4 py-2.5">CURRENT PRICE</th>
                  <th className="px-4 py-2.5">MARKET VALUE</th>
                  <th className="px-4 py-2.5">UNREALIZED P&L</th>
                  <th className="px-4 py-2.5">STOP LOSS</th>
                  <th className="px-4 py-2.5">TAKE PROFIT</th>
                  <th className="px-4 py-2.5">EXPOSURE %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {portfolio.positions.map((p) => {
                  const isPos = p.unrealizedPnL >= 0;
                  return (
                    <tr key={p.symbol} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-100">{p.symbol}</td>
                      <td className="px-4 py-3">{p.quantity}</td>
                      <td className="px-4 py-3">${p.averageEntryPrice.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-100">${p.currentPrice.toFixed(2)}</td>
                      <td className="px-4 py-3">${p.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td className={`px-4 py-3 font-semibold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPos ? '+' : ''}${p.unrealizedPnL.toFixed(2)} ({isPos ? '+' : ''}{p.unrealizedPnLPct.toFixed(2)}%)
                      </td>
                      <td className="px-4 py-3 text-rose-300/80 font-mono">${p.stopLossPrice?.toFixed(2) || 'N/A'}</td>
                      <td className="px-4 py-3 text-emerald-300/80 font-mono">${p.takeProfitPrice?.toFixed(2) || 'N/A'}</td>
                      <td className="px-4 py-3">{p.notionalExposurePct?.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
