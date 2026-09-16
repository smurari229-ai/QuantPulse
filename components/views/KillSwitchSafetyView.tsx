import React, { useState } from 'react';
import { KillSwitchState, triggerEmergencyKillSwitch, resetKillSwitchWithVerification } from '../../engines/killSwitchEngine';
import { PortfolioState } from '../../types/order';
import { AlertOctagon, ShieldAlert, RotateCcw, AlertTriangle } from 'lucide-react';

interface KillSwitchSafetyViewProps {
  killSwitchState: KillSwitchState;
  portfolio: PortfolioState;
  onKillSwitchChanged: (newState: KillSwitchState) => void;
}

export const KillSwitchSafetyView: React.FC<KillSwitchSafetyViewProps> = ({
  killSwitchState,
  portfolio,
  onKillSwitchChanged,
}) => {
  const [manualReason, setManualReason] = useState('Operator manual stop test');
  const [inputAuthCode, setInputAuthCode] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const isHalted = killSwitchState.isEmergencyStopTripped || killSwitchState.isGlobalTradingOff;

  const handleTripManual = () => {
    onKillSwitchChanged(triggerEmergencyKillSwitch(killSwitchState, manualReason));
  };

  const handleResetAttempt = () => {
    setResetError(null);
    const result = resetKillSwitchWithVerification(killSwitchState, inputAuthCode);
    if (result.success) {
      onKillSwitchChanged(result.updatedState);
      setInputAuthCode('');
    } else {
      setResetError(result.error || 'Failed to reset kill switch.');
    }
  };

  return (
    <div className="space-y-6">
      <div className={`p-5 rounded-lg border flex flex-wrap items-center justify-between gap-4 font-mono ${isHalted ? 'bg-rose-950/60 border-rose-500 text-rose-200 animate-pulse' : 'bg-slate-900 border-slate-800 text-slate-300'}`}>
        <div className="flex items-center space-x-3">
          <AlertOctagon className={`w-8 h-8 ${isHalted ? 'text-rose-400' : 'text-emerald-400'}`} />
          <div>
            <h2 className="text-base font-bold text-slate-100">
              {isHalted ? 'EMERGENCY KILL SWITCH ACTIVATED — ALL TRADING FROZEN' : 'SYSTEM SAFETY ENGINE: ARMED & MONITORING'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Paper execution remains sandboxed; no live-money router is exposed in this phase.</p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded font-bold text-xs ${isHalted ? 'bg-rose-900 text-rose-200 border border-rose-600' : 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'}`}>
          {isHalted ? 'STATE: TRIPPED' : 'STATE: NORMAL ARMED'}
        </span>
      </div>

      {isHalted ? (
        <div className="bg-rose-950/40 border border-rose-700/80 rounded-lg p-5 space-y-4 font-mono text-xs">
          <div className="flex items-center space-x-2 text-rose-300 font-bold text-sm"><ShieldAlert className="w-5 h-5 text-rose-400" /><span>INCIDENT POST-MORTEM & RESET PROTOCOL</span></div>
          <div className="p-3 bg-slate-950/80 rounded border border-rose-900/60 space-y-1.5 text-slate-300">
            <div><strong>Tripped At:</strong> {killSwitchState.lastTrippedTimestamp ? new Date(killSwitchState.lastTrippedTimestamp).toLocaleString() : 'N/A'}</div>
            <div><strong>Primary Trigger:</strong> <span className="text-rose-400 font-bold">{killSwitchState.lastTrippedReason || 'N/A'}</span></div>
            <div><strong>Reset Code:</strong> <span className="text-amber-400 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{killSwitchState.resetConfirmationCode || 'NOT_AVAILABLE'}</span></div>
            <div className="text-slate-500">The code is session-scoped and is required only for this local paper-sandbox reset.</div>
          </div>
          <div className="p-4 bg-slate-900 rounded border border-slate-800 space-y-3">
            <span className="text-slate-200 font-bold block">Operator Re-Arm:</span>
            <div className="flex flex-wrap items-center gap-3">
              <input type="text" placeholder="Enter confirmation code..." value={inputAuthCode} onChange={(e) => setInputAuthCode(e.target.value.toUpperCase())} className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-100 font-bold tracking-wider focus:outline-none focus:border-blue-500 text-xs uppercase" />
              <button onClick={handleResetAttempt} className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-1.5 rounded transition-colors text-xs"><RotateCcw className="w-3.5 h-3.5" /><span>Verify Code & Re-Arm</span></button>
            </div>
            {resetError && <div className="text-rose-400 font-bold mt-2">{resetError}</div>}
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 font-mono text-xs">
          <div className="flex items-center space-x-2 text-slate-200 font-bold text-sm"><AlertTriangle className="w-5 h-5 text-amber-400" /><span>MANUAL OPERATOR EMERGENCY HALT</span></div>
          <p className="text-slate-400">Triggering the switch freezes future execution decisions and requires an explicit reset code.</p>
          <div className="flex flex-wrap items-center gap-3">
            <input type="text" value={manualReason} onChange={(e) => setManualReason(e.target.value)} placeholder="Reason for emergency halt..." className="flex-1 min-w-[280px] bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-rose-500 text-xs" />
            <button onClick={handleTripManual} className="flex items-center space-x-2 bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-1.5 rounded transition-colors"><AlertOctagon className="w-4 h-4" /><span>TRIGGER EMERGENCY STOP</span></button>
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-950/40 border-b border-slate-800 text-xs font-mono"><h3 className="font-bold text-slate-200">Kill-Switch Trigger Matrix</h3></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs font-mono"><thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800"><tr><th className="px-4 py-2.5">TRIGGER</th><th className="px-4 py-2.5">CONDITION</th><th className="px-4 py-2.5">STATUS</th><th className="px-4 py-2.5">ACTION</th></tr></thead><tbody className="divide-y divide-slate-800/60 text-slate-300">
          <tr><td className="px-4 py-3 font-bold">Manual Operator</td><td className="px-4 py-3 text-slate-400">Immediate human override</td><td className="px-4 py-3 text-emerald-400 font-bold">READY</td><td className="px-4 py-3 text-slate-400">Freeze future orders</td></tr>
          <tr><td className="px-4 py-3 font-bold">Daily Loss Limit</td><td className="px-4 py-3 text-slate-400">Daily P&L at configured limit</td><td className="px-4 py-3 text-emerald-400 font-bold">ARMED ({portfolio.dailyPnLPct.toFixed(2)}%)</td><td className="px-4 py-3 text-slate-400">Block new entries</td></tr>
          <tr><td className="px-4 py-3 font-bold">Stale Data</td><td className="px-4 py-3 text-slate-400">Feed age above risk threshold</td><td className="px-4 py-3 text-emerald-400 font-bold">ARMED</td><td className="px-4 py-3 text-slate-400">Abort unsafe submissions</td></tr>
          <tr><td className="px-4 py-3 font-bold">API / Broker Failure</td><td className="px-4 py-3 text-slate-400">Heartbeat unavailable</td><td className="px-4 py-3 text-emerald-400 font-bold">ARMED</td><td className="px-4 py-3 text-slate-400">Safe disconnect</td></tr>
          <tr><td className="px-4 py-3 font-bold">Abnormal Frequency</td><td className="px-4 py-3 text-slate-400">Repeated order attempts</td><td className="px-4 py-3 text-emerald-400 font-bold">ARMED</td><td className="px-4 py-3 text-slate-400">Lock order generation</td></tr>
        </tbody></table></div>
      </div>
    </div>
  );
};
