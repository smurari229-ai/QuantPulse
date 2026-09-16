import React, { useState } from 'react';
import { REGISTERED_STRATEGIES, evaluateStrategySignal } from '../../engines/strategyEngine';
import { StrategyDefinition, StrategySignalOutput } from '../../types/strategy';
import { OHLCV } from '../../types/market';
import { Layers, ShieldAlert, ArrowRightCircle, Target, CheckCircle2, Sliders } from 'lucide-react';

interface StrategyStatusViewProps {
  symbol: string;
  bars: OHLCV[];
}

export const StrategyStatusView: React.FC<StrategyStatusViewProps> = ({ symbol, bars }) => {
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(REGISTERED_STRATEGIES[0].id);

  const selectedStrategy = REGISTERED_STRATEGIES.find((s) => s.id === selectedStrategyId) || REGISTERED_STRATEGIES[0];
  const signalOutput: StrategySignalOutput = evaluateStrategySignal(selectedStrategy, symbol, bars);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-100">Quantitative Strategy Registry</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic quantitative strategies with explicit mathematical entry/exit rules, mandatory stop losses, and transparent assumptions.
          </p>
        </div>
        <div className="text-xs font-mono text-slate-400">
          Target Instrument: <strong className="text-slate-200">${symbol}</strong>
        </div>
      </div>

      {/* Strategy Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {REGISTERED_STRATEGIES.map((strat: StrategyDefinition) => {
          const isSelected = strat.id === selectedStrategyId;
          const sig = evaluateStrategySignal(strat, symbol, bars);
          return (
            <button
              key={strat.id}
              onClick={() => setSelectedStrategyId(strat.id)}
              className={`p-3 rounded-lg border text-left transition-all ${
                isSelected
                  ? 'bg-blue-950/40 border-blue-500 shadow-sm'
                  : 'bg-slate-900 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">
                  {strat.type}
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                  sig.signal === 'BUY'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                    : sig.signal === 'SELL'
                    ? 'bg-rose-950 text-rose-400 border border-rose-500/40'
                    : 'bg-slate-800 text-slate-400'
                }`}>
                  {sig.signal}
                </span>
              </div>
              <h3 className="text-xs font-bold text-slate-200 line-clamp-1">{strat.name}</h3>
              <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{strat.description}</p>
            </button>
          );
        })}
      </div>

      {/* Selected Strategy Deep-Dive */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-6">
        {/* Strategy Header & Signal Summary */}
        <div className="flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <span className="text-xs font-mono text-indigo-400 font-semibold block mb-1">STRATEGY SPECIFICATION</span>
            <h3 className="text-base font-bold text-slate-100">{selectedStrategy.name}</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">{selectedStrategy.description}</p>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800 font-mono text-xs text-right">
            <span className="text-slate-400 block text-[10px]">CURRENT EVALUATION RESULT</span>
            <span className={`text-base font-bold block ${
              signalOutput.signal === 'BUY' ? 'text-emerald-400' : signalOutput.signal === 'SELL' ? 'text-rose-400' : 'text-slate-300'
            }`}>
              {signalOutput.signal}
            </span>
            <span className="text-[11px] text-slate-400">R:R Ratio: <strong>{signalOutput.riskRewardRatio}:1</strong></span>
          </div>
        </div>

        {/* Tactical Parameters & Stop-Loss Logic */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          <div className="p-3.5 bg-slate-950/40 rounded border border-slate-800 space-y-1.5">
            <div className="flex items-center space-x-1.5 text-slate-300 font-semibold text-[11px]">
              <Target className="w-3.5 h-3.5 text-blue-400" />
              <span>Suggested Entry Price</span>
            </div>
            <div className="text-base font-bold text-slate-100">${signalOutput.suggestedEntry.toFixed(2)}</div>
            <div className="text-[10px] text-slate-500">Subject to live slippage check</div>
          </div>

          <div className="p-3.5 bg-slate-950/40 rounded border border-slate-800 space-y-1.5">
            <div className="flex items-center space-x-1.5 text-rose-300 font-semibold text-[11px]">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>Mandatory Stop Loss</span>
            </div>
            <div className="text-base font-bold text-rose-400">${signalOutput.suggestedStopLoss.toFixed(2)}</div>
            <div className="text-[10px] text-slate-400">{selectedStrategy.stopLossRule}</div>
          </div>

          <div className="p-3.5 bg-slate-950/40 rounded border border-slate-800 space-y-1.5">
            <div className="flex items-center space-x-1.5 text-emerald-300 font-semibold text-[11px]">
              <ArrowRightCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>Take Profit Target</span>
            </div>
            <div className="text-base font-bold text-emerald-400">${signalOutput.suggestedTakeProfit.toFixed(2)}</div>
            <div className="text-[10px] text-slate-400">{selectedStrategy.takeProfitRule}</div>
          </div>
        </div>

        {/* Entry & Exit Rules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-950/40 rounded border border-slate-800 space-y-2">
            <span className="text-xs font-mono font-bold text-slate-300 flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>DETERMINISTIC ENTRY CONDITIONS</span>
            </span>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {selectedStrategy.entryConditions.map((cond, i) => (
                <li key={i} className="flex items-start space-x-2">
                  <span className="text-slate-500 font-mono text-[10px] mt-0.5">•</span>
                  <span>{cond}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 bg-slate-950/40 rounded border border-slate-800 space-y-2">
            <span className="text-xs font-mono font-bold text-slate-300 flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-rose-400" />
              <span>DETERMINISTIC EXIT CONDITIONS</span>
            </span>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {selectedStrategy.exitConditions.map((cond, i) => (
                <li key={i} className="flex items-start space-x-2">
                  <span className="text-slate-500 font-mono text-[10px] mt-0.5">•</span>
                  <span>{cond}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Position Sizing & Statistical Assumptions */}
        <div className="p-4 bg-slate-950/40 rounded border border-slate-800 space-y-3 font-mono text-xs">
          <div className="flex items-center space-x-2 text-slate-300 font-bold">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span>Position-Sizing Method & Underlying Statistical Hypotheses</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-slate-400 text-[11px] block mb-1">POSITION SIZING LOGIC</span>
              <span className="px-2 py-1 bg-slate-800 text-slate-200 rounded font-semibold text-[11px]">
                {selectedStrategy.positionSizingMethod}
              </span>
              <p className="text-[11px] text-slate-400 mt-1">
                Calculates lot size based on distance between entry and stop loss divided by maximum permitted dollar risk per trade.
              </p>
            </div>
            <div>
              <span className="text-slate-400 text-[11px] block mb-1">STATISTICAL ASSUMPTIONS</span>
              <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-300">
                {selectedStrategy.assumptions.map((asm, i) => (
                  <li key={i}>{asm}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
