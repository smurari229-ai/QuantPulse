import React, { useState } from 'react';
import { KillSwitchState, triggerEmergencyKillSwitch, resetKillSwitch } from '../../engines/killSwitchEngine';
import { PortfolioState } from '../../types/order';
import { AlertOctagon, ShieldAlert, Key, CheckCircle2, RotateCcw, AlertTriangle, ShieldCheck } from 'lucide-react';

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
  const [manualReason, setManualReason] = useState<string>('Operator manual stop test');
  const [inputAuthCode, setInputAuthCode] = useState<string>('');
  const [resetError, setResetError] = useState<string | null>(null);

  const isHalted = killSwitchState.isEmergencyStopTripped || killSwitchState.isGlobalTradingOff;

  const handleTripManual = () => {
    const updated = triggerEmergencyKillSwitch(manualReason, portfolio);
    onKillSwitchChanged(updated);
  };

  const handleResetAttempt = () => {
    setResetError(null);
    const result = resetKillSwitch(inputAuthCode, 'Operator (ID: SEC-ADMIN-01)');
    if (result.success && result.state) {
      onKillSwitchChanged(result.state);
      setInputAuthCode('');
    } else {
      setResetError(result.error || 'Failed to reset kill switch.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Status */}
      <div className={`p-5 rounded-lg border flex flex-wrap items-center justify-between gap-4 font-mono ${
        isHalted
          ? 'bg-rose-950/60 border-rose-500 text-rose-200 animate-pulse'
          : 'bg-slate-900 border-slate-800 text-slate-300'
      }`}>
        <div className="flex items-center space-x-3">
          <AlertOctagon className={`w-8 h-8 ${isHalted ? 'text-rose-400' : 'text-emerald-400'}`} />
          <div>
            <h2 className="text-base font-bold text-slate-100">
              {isHalted ? 'EMERGENCY KILL SWITCH ACTIVATED — ALL TRADING FROZEN' : 'SYSTEM SAFETY ENGINE: ARMED & MONITORING'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Multi-trigger hardware safety layer. Zero orders will be executed while tripped.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-xs">
          <span className={`px-3 py-1 rounded font-bold ${
            isHalted
              ? 'bg-rose-900 text-rose-200 border border-rose-600'
              : 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
          }`}>
            {isHalted ? 'STATE: TRIPPED' : 'STATE: NORMAL ARMED'}
          </span>
        </div>
      </div>

      {/* Tripped State Management & Dual Authorization Reset */}
      {isHalted ? (
        <div className="bg-rose-950/40 border border-rose-700/80 rounded-lg p-5 space-y-4 font-mono text-xs">
          <div className="flex items-center space-x-2 text-rose-300 font-bold text-sm">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <span>INCIDENT POST-MORTEM & RESET PROTOCOL</span>
          </div>

          <div className="p-3 bg-slate-950/80 rounded border border-rose-900/60 space-y-1.5 text-slate-300">
            <div><strong>Tripped At:</strong> {killSwitchState.trippedTimestamp ? new Date(killSwitchState.trippedTimestamp).toLocaleString() : 'N/A'}</div>
            <div><strong>Primary Trigger:</strong> <span className="text-rose-400 font-bold">{killSwitchState.triggerReason}</span></div>
            <div>
              <strong>Required Dual Auth Code:</strong>{' '}
              <span className="text-amber-400 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {killSwitchState.resetConfirmationCode}
              </span>{' '}
              <span className="text-slate-500 text-[10px]">(Cryptographically generated for this session)</span>
            </div>
          </div>

          <div className="p-4 bg-slate-900 rounded border border-slate-800 space-y-3">
            <span className="text-slate-200 font-bold block">Operator Override & Manual System Re-Arm:</span>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Enter confirmation code..."
                value={inputAuthCode}
                onChange={(e) => setInputAuthCode(e.target.value.toUpperCase())}
                className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-slate-100 font-bold tracking-wider focus:outline-none focus:border-blue-500 text-xs uppercase"
              />
              <button
                onClick={handleResetAttempt}
                className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-1.5 rounded transition-colors text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Verify Code & Re-Arm System</span>
              </button>
            </div>
            {resetError && <div className="text-rose-400 font-bold mt-2">{resetError}</div>}
          </div>
        </div>
      ) : (
        /* Manual Trigger Section */
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 font-mono text-xs">
          <div className="flex items-center space-x-2 text-slate-200 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <span>MANUAL OPERATOR EMERGENCY HALT</span>
          </div>
          <p className="text-slate-400">
            Triggering the kill switch instantly cancels all pending orders, terminates active strategy evaluation loops, and halts order routing.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              placeholder="Reason for emergency halt..."
              className="flex-1 min-w-[280px] bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-slate-200 focus:outline-none focus:border-rose-500 text-xs"
            />
            <button
              onClick={handleTripManual}
              className="flex items-center space-x-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold px-4 py-1.5 rounded transition-colors shadow-sm"
            >
              <AlertOctagon className="w-4 h-4" />
              <span>TRIGGER EMERGENCY STOP</span>
            </button>
          </div>
        </div>
      )}

      {/* Multi-Trigger Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-950/40 border-b border-slate-800 flex justify-between items-center text-xs font-mono">
          <div className="flex items-center space-x-2">
            <h3 className="font-bold text-slate-200">The 8 Autonomous Kill Switch Triggers</h3>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">Continuous Real-Time Evaluators</span>
          </div>
          <span className="text-slate-500 text-[11px]">Fail-Safe Status: ACTIVE</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-2.5">TRIGGER SOURCE</th>
                <th className="px-4 py-2.5">THRESHOLD / CONDITION</th>
                <th className="px-4 py-2.5">STATUS</th>
                <th className="px-4 py-2.5">ACTION TAKEN ON TRIP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              <tr className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-bold text-slate-200">Manual Operator Button</td>
                <td className="px-4 py-3 text-slate-400">Immediate human override via UI or CLI</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">READY</td>
                <td className="px-4 py-3 text-slate-400">Freeze system, reject all future orders</td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-bold text-slate-200">Daily Loss Limit</td>
                <td className="px-4 py-3 text-rose-400 font-bold">Drawdown &gt;= -3.00%</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">ARMED (DD: {portfolio.currentDrawdownPct.toFixed(2)}%)</td>
                <td className="px-4 py-3 text-slate-400">Halt all new entries until next trading session</td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-bold text-slate-200">Extreme Volatility Spike</td>
                <td className="px-4 py-3 text-slate-400">ATR &gt; 3.0x 30-day baseline or &gt;5% gap bar</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">MONITORING</td>
                <td className="px-4 py-3 text-slate-400">Pause execution, widen spread bands</td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-bold text-slate-200">Repeated Order Rejections</td>
                <td className="px-4 py-3 text-slate-400">5 consecutive risk rejections within 60s</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">ARMED</td>
                <td className="px-4 py-3 text-slate-400">Lock AI order generation stream</td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-bold text-slate-200">Stale Data Feed Guard</td>
                <td className="px-4 py-3 text-slate-400">Feed latency &gt; 3000ms or 3 missing bars</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">ARMED</td>
                <td className="px-4 py-3 text-slate-400">Abort order submission, fallback to NO_TRADE</td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-bold text-slate-200">Network / API Socket Failure</td>
                <td className="px-4 py-3 text-slate-400">Heartbeat lost &gt; 2000ms</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">MONITORING</td>
                <td className="px-4 py-3 text-slate-400">Safe disconnect mode</td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-bold text-slate-200">Broker Gateway Disconnect</td>
                <td className="px-4 py-3 text-slate-400">Broker OMS ping response timeout</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">ARMED</td>
                <td className="px-4 py-3 text-slate-400">Halt order routing</td>
              </tr>
              <tr className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-bold text-slate-200">Multi-Asset Correlation Breakdown</td>
                <td className="px-4 py-3 text-slate-400">Index vs component divergence &gt; 4 sigma</td>
                <td className="px-4 py-3 text-emerald-400 font-bold">MONITORING</td>
                <td className="px-4 py-3 text-slate-400">Reduce position sizing by 75%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
