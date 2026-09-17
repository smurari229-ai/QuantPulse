import React, { useState } from 'react';
import { SystemExecutionMode, RiskEngineConfig } from '../../types/order';
import { DEFAULT_RISK_CONFIG } from '../../engines/riskEngine';
import { Settings, Shield, Lock, AlertTriangle, Save, RefreshCw, Cpu, Activity, Database } from 'lucide-react';

interface SettingsViewProps {
  executionMode: SystemExecutionMode;
  onUpdateExecutionMode: (mode: SystemExecutionMode) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  executionMode,
  onUpdateExecutionMode,
}) => {
  const [config, setConfig] = useState<RiskEngineConfig>(DEFAULT_RISK_CONFIG);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const handleSave = () => {
    Object.assign(DEFAULT_RISK_CONFIG, config);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-100">Institutional Governance & System Health Configuration</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">Deterministic risk boundaries, live execution safeguards, and system runtime telemetry.</p>
        </div>
        <button onClick={handleSave} className="flex items-center space-x-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-mono font-semibold transition-colors shadow-sm">
          <Save className="w-3.5 h-3.5" /><span>{isSaved ? 'Parameters Saved!' : 'Save Risk Boundaries'}</span>
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 font-mono text-xs">
        <div className="flex items-center space-x-2 text-slate-100 font-bold border-b border-slate-800 pb-2"><Shield className="w-4 h-4 text-rose-400" /><span>REAL-MONEY EXECUTION GOVERNANCE & LOCKDOWN</span></div>
        <div className="p-3.5 bg-amber-950/30 border border-amber-500/40 rounded-lg text-amber-200/90 text-xs space-y-1">
          <div className="font-bold text-amber-300 flex items-center space-x-1.5"><AlertTriangle className="w-4 h-4 text-amber-400" /><span>RULES 2 & 3 ENFORCEMENT:</span></div>
          <p>Real-money broker order routing is locked by default. Live execution requires Phase 10 regulatory audit certification and dual-key administrative sign-off.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="p-4 bg-slate-950/60 rounded border border-slate-800 space-y-2">
            <span className="text-slate-400 block text-[11px]">ACTIVE EXECUTION MODE</span>
            <div className="flex items-center space-x-2"><span className={`px-3 py-1 rounded font-bold text-xs ${executionMode === 'PAPER' ? 'bg-amber-500/10 border border-amber-500/40 text-amber-300' : 'bg-rose-950/50 border border-rose-500/60 text-rose-300'}`}>{executionMode}</span></div>
            <p className="text-[11px] text-slate-500">Orders run through synthetic fill simulator with realistic slippage and taxes.</p>
          </div>
          <div className="p-4 bg-slate-950/60 rounded border border-slate-800 space-y-2">
            <span className="text-slate-400 block text-[11px]">LIVE BROKER GATEWAY OVERRIDE</span>
            <button disabled className="px-3 py-1.5 bg-slate-800 text-slate-500 rounded font-bold text-xs flex items-center space-x-2 cursor-not-allowed" title="Blocked until Phase 10"><Lock className="w-3.5 h-3.5" /><span>Direct Live Mode (Hardware Locked)</span></button>
            <p className="text-[11px] text-rose-400/90">Direct live routing blocked: Phase 9 SEBI compliance sign-off & broker OMS certification required.</p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 font-mono text-xs">
        <div className="flex items-center space-x-2 text-slate-100 font-bold border-b border-slate-800 pb-2"><Settings className="w-4 h-4 text-blue-400" /><span>DETERMINISTIC PRE-TRADE RISK GATE CEILINGS</span></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX POSITION NOTIONAL ($)</label><input type="number" value={config.maxPositionSizeNotional} onChange={(e) => setConfig({ ...config, maxPositionSizeNotional: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #3 Ceiling</span></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX PORTFOLIO EXPOSURE (%)</label><input type="number" value={config.maxPortfolioExposurePct} onChange={(e) => setConfig({ ...config, maxPortfolioExposurePct: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #5 Ceiling</span></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX DAILY LOSS LIMIT (%)</label><input type="number" value={config.maxDailyLossPct} onChange={(e) => setConfig({ ...config, maxDailyLossPct: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #6 Circuit Breaker</span></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX DRAWDOWN HALT (%)</label><input type="number" value={config.maxDrawdownHaltPct} onChange={(e) => setConfig({ ...config, maxDrawdownHaltPct: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #7 Ceiling</span></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX SPREAD FILTER (BPS)</label><input type="number" value={config.maxSpreadBps} onChange={(e) => setConfig({ ...config, maxSpreadBps: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #13 Ceiling</span></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX DATA STALENESS (MS)</label><input type="number" value={config.maxDataStalenessMs} onChange={(e) => setConfig({ ...config, maxDataStalenessMs: Number(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #15 Ceiling</span></div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 font-mono text-xs">
        <div className="flex items-center space-x-2 text-slate-100 font-bold border-b border-slate-800 pb-2"><Activity className="w-4 h-4 text-emerald-400" /><span>SYSTEM RUNTIME & CLOUD CONTAINER TELEMETRY</span></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800"><span className="text-slate-400 text-[10px] block mb-1">FEED TICK LATENCY</span><span className="text-emerald-400 font-bold text-sm">38 ms</span><span className="text-[10px] text-slate-500 block mt-0.5">WebSocket L2 Stream</span></div>
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800"><span className="text-slate-400 text-[10px] block mb-1">EVENT LOOP TICK DRIFT</span><span className="text-emerald-400 font-bold text-sm">1.2 ms</span><span className="text-[10px] text-slate-500 block mt-0.5">Jitter &lt; 3.0ms</span></div>
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800"><span className="text-slate-400 text-[10px] block mb-1">AUDIT LEDGER HEIGHT</span><span className="text-slate-200 font-bold text-sm">SHA-256 Chained</span><span className="text-[10px] text-slate-500 block mt-0.5">Zero Secret Sanitized</span></div>
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800"><span className="text-slate-400 text-[10px] block mb-1">CONTAINER MEMORY</span><span className="text-slate-200 font-bold text-sm">184 MB / 1024 MB</span><span className="text-[10px] text-slate-500 block mt-0.5">V8 Heap Safe</span></div>
        </div>
      </div>
    </div>
  );
};
