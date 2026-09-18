import React, { useState } from 'react';
import { SystemExecutionMode, RiskEngineConfig } from '../../types/order';
import { DEFAULT_RISK_CONFIG } from '../../engines/riskEngine';
import { Settings, Shield, Lock, AlertTriangle, Save, Activity } from 'lucide-react';

interface SettingsViewProps {
  executionMode: SystemExecutionMode;
  onUpdateExecutionMode: (mode: SystemExecutionMode) => void;
  onRiskConfigSaved: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  executionMode,
  onUpdateExecutionMode,
  onRiskConfigSaved,
}) => {
  const [config, setConfig] = useState<RiskEngineConfig>({ ...DEFAULT_RISK_CONFIG });
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string>('');

  const validateConfig = (nextConfig: RiskEngineConfig): string | null => {
    if (!Number.isFinite(nextConfig.maxPositionSizeNotional) || nextConfig.maxPositionSizeNotional <= 0) return 'Max position notional must be a finite value greater than 0.';
    if (!Number.isFinite(nextConfig.maxPositionPctOfPortfolio) || nextConfig.maxPositionPctOfPortfolio <= 0 || nextConfig.maxPositionPctOfPortfolio > 100) return 'Max position percentage must be between 0 and 100.';
    if (!Number.isFinite(nextConfig.maxPortfolioExposurePct) || nextConfig.maxPortfolioExposurePct <= 0 || nextConfig.maxPortfolioExposurePct > 100) return 'Max portfolio exposure must be between 0 and 100.';
    if (!Number.isFinite(nextConfig.maxDailyLossPct) || nextConfig.maxDailyLossPct <= 0 || nextConfig.maxDailyLossPct > 100) return 'Max daily loss must be between 0 and 100.';
    if (!Number.isFinite(nextConfig.maxDrawdownHaltPct) || nextConfig.maxDrawdownHaltPct <= 0 || nextConfig.maxDrawdownHaltPct > 100) return 'Max drawdown halt must be between 0 and 100.';
    if (!Number.isFinite(nextConfig.maxSpreadBps) || nextConfig.maxSpreadBps <= 0) return 'Max spread must be a finite value greater than 0.';
    if (!Number.isFinite(nextConfig.maxDataStalenessMs) || nextConfig.maxDataStalenessMs <= 0) return 'Max data staleness must be a finite value greater than 0.';
    return null;
  };

  const handleSave = () => {
    const error = validateConfig(config);
    if (error) {
      setValidationError(error);
      setIsSaved(false);
      return;
    }
    setValidationError('');
    Object.assign(DEFAULT_RISK_CONFIG, config);
    onRiskConfigSaved();
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

      {validationError && (
        <div className="p-3 bg-rose-950/40 border border-rose-600/70 rounded-lg text-xs text-rose-200 font-mono flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Risk boundary validation failed: {validationError}</span>
        </div>
      )}

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
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX POSITION NOTIONAL ($)</label><input type="number" min="0.01" value={config.maxPositionSizeNotional} onChange={(e) => { setValidationError(''); setConfig({ ...config, maxPositionSizeNotional: Number(e.target.value) }); }} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #3 Ceiling</span></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX POSITION % OF PORTFOLIO</label><input type="number" min="0.01" max="100" value={config.maxPositionPctOfPortfolio} onChange={(e) => { setValidationError(''); setConfig({ ...config, maxPositionPctOfPortfolio: Number(e.target.value) }); }} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #4 Ceiling</span></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX PORTFOLIO EXPOSURE (%)</label><input type="number" min="0.01" max="100" value={config.maxPortfolioExposurePct} onChange={(e) => { setValidationError(''); setConfig({ ...config, maxPortfolioExposurePct: Number(e.target.value) }); }} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #5 Ceiling</span></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX DAILY LOSS LIMIT (%)</label><input type="number" min="0.01" max="100" value={config.maxDailyLossPct} onChange={(e) => { setValidationError(''); setConfig({ ...config, maxDailyLossPct: Number(e.target.value) }); }} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #6 Circuit Breaker</span></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX DRAWDOWN HALT (%)</label><input type="number" min="0.01" max="100" value={config.maxDrawdownHaltPct} onChange={(e) => { setValidationError(''); setConfig({ ...config, maxDrawdownHaltPct: Number(e.target.value) }); }} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #7 Ceiling</span></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX SPREAD FILTER (BPS)</label><input type="number" min="0.01" value={config.maxSpreadBps} onChange={(e) => { setValidationError(''); setConfig({ ...config, maxSpreadBps: Number(e.target.value) }); }} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #13 Ceiling</span></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">MAX DATA STALENESS (MS)</label><input type="number" min="1" value={config.maxDataStalenessMs} onChange={(e) => { setValidationError(''); setConfig({ ...config, maxDataStalenessMs: Number(e.target.value) }); }} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-blue-500" /><span className="text-[10px] text-slate-500">Gate #16 Ceiling</span></div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 font-mono text-xs">
        <div className="flex items-center space-x-2 text-slate-100 font-bold border-b border-slate-800 pb-2"><Activity className="w-4 h-4 text-emerald-400" /><span>SIMULATION TELEMETRY (NON-PRODUCTION)</span></div>
        <div className="p-3 bg-amber-950/20 border border-amber-500/30 rounded text-[10px] text-amber-200/80">The values below are static UI demonstration values, not live container, broker, WebSocket, or memory telemetry.</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800"><span className="text-slate-400 text-[10px] block mb-1">SIMULATED FEED LATENCY</span><span className="text-emerald-400 font-bold text-sm">45 ms</span><span className="text-[10px] text-slate-500 block mt-0.5">Synthetic snapshot generator</span></div>
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800"><span className="text-slate-400 text-[10px] block mb-1">EVENT LOOP DRIFT</span><span className="text-slate-200 font-bold text-sm">Not measured</span><span className="text-[10px] text-slate-500 block mt-0.5">No production runtime probe</span></div>
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800"><span className="text-slate-400 text-[10px] block mb-1">AUDIT LEDGER</span><span className="text-slate-200 font-bold text-sm">In-memory hash chain</span><span className="text-[10px] text-slate-500 block mt-0.5">Non-cryptographic demo</span></div>
          <div className="p-3 bg-slate-950/60 rounded border border-slate-800"><span className="text-slate-400 text-[10px] block mb-1">CONTAINER MEMORY</span><span className="text-slate-200 font-bold text-sm">Not measured</span><span className="text-[10px] text-slate-500 block mt-0.5">No server runtime telemetry</span></div>
        </div>
      </div>
    </div>
  );
};
