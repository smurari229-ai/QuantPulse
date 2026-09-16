import React, { useState } from 'react';
import { AIDecisionOutput } from '../../types/ai';
import { TechnicalIndicators } from '../../types/strategy';
import { generateAIDecision } from '../../engines/aiDecisionEngine';
import { Cpu, AlertTriangle, CheckCircle2, Shield, Code, RefreshCw } from 'lucide-react';

interface AiDecisionViewProps {
  decision: AIDecisionOutput;
  indicators: TechnicalIndicators;
  currentPrice: number;
  symbol: string;
  onRefreshDecision: (newDecision: AIDecisionOutput) => void;
}

export const AiDecisionView: React.FC<AiDecisionViewProps> = ({
  decision,
  indicators,
  currentPrice,
  symbol,
  onRefreshDecision,
}) => {
  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);

  const handleReRun = () => {
    setIsEvaluating(true);
    setTimeout(() => {
      const updated = generateAIDecision({
        symbol,
        timestamp: Date.now(),
        currentPrice,
        indicators,
        currentMarketConditions: {
          spreadBps: 4.2,
          dataStalenessMs: 45,
        },
      });
      onRefreshDecision(updated);
      setIsEvaluating(false);
    }, 450);
  };

  const getSignalBadge = (sig: AIDecisionOutput['signal']) => {
    switch (sig) {
      case 'BUY':
        return <span className="px-3 py-1 bg-emerald-950/80 border border-emerald-500 text-emerald-400 font-mono font-bold text-sm rounded">BUY SIGNAL</span>;
      case 'SELL':
        return <span className="px-3 py-1 bg-rose-950/80 border border-rose-500 text-rose-400 font-mono font-bold text-sm rounded">SELL SIGNAL</span>;
      case 'HOLD':
        return <span className="px-3 py-1 bg-blue-950/80 border border-blue-500 text-blue-400 font-mono font-bold text-sm rounded">HOLD POSITION</span>;
      default:
        return <span className="px-3 py-1 bg-amber-950/80 border border-amber-500 text-amber-400 font-mono font-bold text-sm rounded">NO TRADE / WAIT</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Mandatory Disclosure Banner */}
      <div className="bg-amber-950/30 border border-amber-500/40 rounded-lg p-3.5 flex items-start space-x-3 text-xs text-amber-200/90 font-mono">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-amber-300 block mb-0.5">RULE 1 & 6 COMPLIANCE MANDATE:</span>
          <span>
            {decision.confidenceCalibrationNote} The AI Decision Engine produces recommendations strictly subordinate to the deterministic Pre-Trade Risk Engine. The AI is explicitly permitted to return NO_TRADE / WAIT.
          </span>
        </div>
      </div>

      {/* Main AI Verdict Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 bg-slate-950/40 border-b border-slate-800 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded bg-indigo-900/50 border border-indigo-500/30 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-semibold text-slate-100">Structured AI Decision Output</h2>
                <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                  {decision.modelIdentifier}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Asset: {symbol} · Generated at {new Date(decision.generatedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-mono transition-colors"
            >
              <Code className="w-3.5 h-3.5" />
              <span>{showRawJson ? 'Hide Schema' : 'Inspect JSON Schema'}</span>
            </button>
            <button
              onClick={handleReRun}
              disabled={isEvaluating}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 text-white rounded text-xs font-semibold transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEvaluating ? 'animate-spin' : ''}`} />
              <span>{isEvaluating ? 'Evaluating...' : 'Re-Run AI Inference'}</span>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {/* Signal & Confidence */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800">
              <span className="text-slate-400 text-xs font-mono block mb-2">RECOMMENDED ACTION</span>
              <div>{getSignalBadge(decision.signal)}</div>
              <span className="text-[11px] text-slate-400 block mt-2 font-mono">Strategy: {decision.strategy}</span>
            </div>

            <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800 md:col-span-2 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-400">HEURISTIC PATTERN CONFIDENCE SCORE:</span>
                <span className="text-base font-bold text-slate-100">
                  {(decision.confidence * 100).toFixed(1)}% (Heuristic affinity, NOT probability of profit)
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${decision.confidence * 100}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                Formula uncalibrated score based on technical factor consensus and market regime compatibility.
              </div>
            </div>
          </div>

          {/* Reasoning Narrative */}
          <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800 space-y-1.5">
            <span className="text-xs font-mono text-slate-400 font-bold uppercase">Synthesized Rationale & Market Context:</span>
            <p className="text-xs text-slate-200 leading-relaxed font-mono">{decision.reasoning}</p>
          </div>

          {/* Risk Flags & Required Checks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Risk Flags */}
            <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-rose-400">
                <AlertTriangle className="w-4 h-4" />
                <span>IDENTIFIED RISK FLAGS ({decision.risk_flags.length})</span>
              </div>
              {decision.risk_flags.length === 0 ? (
                <p className="text-xs text-slate-400 font-mono">Zero anomalous risk flags detected in market condition vector.</p>
              ) : (
                <ul className="space-y-1.5 text-xs font-mono">
                  {decision.risk_flags.map((flag, idx) => (
                    <li key={idx} className="flex items-center space-x-2 text-rose-300/90 bg-rose-950/30 px-2 py-1 rounded border border-rose-900/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Mandatory Required Checks for Risk Engine */}
            <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-emerald-400">
                <Shield className="w-4 h-4" />
                <span>MANDATORY CHECKS REQUIRED FOR RISK ENGINE</span>
              </div>
              <ul className="space-y-1.5 text-xs font-mono">
                {decision.required_checks.map((chk, idx) => (
                  <li key={idx} className="flex items-center space-x-2 text-emerald-300/90 bg-emerald-950/30 px-2 py-1 rounded border border-emerald-900/40">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>{chk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Raw JSON Schema Modal / Section */}
          {showRawJson && (
            <div className="space-y-2">
              <span className="text-xs font-mono text-slate-400 uppercase font-semibold">Strict JSON Schema Contract:</span>
              <pre className="p-4 bg-slate-950 text-emerald-400 font-mono text-xs rounded border border-slate-800 overflow-x-auto">
                {JSON.stringify(decision, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
