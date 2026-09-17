import React from 'react';
import { ShieldAlert, Activity, Wifi, Radio, AlertTriangle } from 'lucide-react';
import { SystemExecutionMode } from '../types/order';
import { KillSwitchState } from '../engines/killSwitchEngine';

interface HeaderProps {
  executionMode: SystemExecutionMode;
  killSwitchState: KillSwitchState;
  onTriggerKillSwitch: () => void;
  dailyPnL: number;
  equity: number;
  isStaleData: boolean;
  activeView: string;
}

export const Header: React.FC<HeaderProps> = ({
  executionMode,
  killSwitchState,
  onTriggerKillSwitch,
  dailyPnL,
  equity,
  isStaleData,
}) => {
  const isEmergency = killSwitchState.isEmergencyStopTripped || killSwitchState.isGlobalTradingOff;

  return (
    <header id="platform-main-header" className="bg-slate-900 border-b border-slate-800 text-slate-100 px-4 py-2.5 flex items-center justify-between sticky top-0 z-40 shadow-sm">
      {/* Brand & Mode */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center font-bold text-white tracking-wider shadow-inner text-sm">
            QP
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-slate-100 tracking-tight text-base">QuantPulse</span>
              <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">
                Institutional AI Engine
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Algorithmic Risk & Execution Architecture</p>
          </div>
        </div>

        {/* Execution Mode Badge - CRITICAL: Paper vs Live Differentiation */}
        <div className="ml-4 pl-4 border-l border-slate-800 flex items-center">
          {executionMode === 'PAPER' ? (
            <div
              id="badge-paper-mode"
              className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-amber-300 font-mono text-xs font-semibold tracking-wide"
              title="Simulation sandbox active with full cost & slippage modeling. Real-money broker execution is disabled."
            >
              <Radio className="w-3.5 h-3.5 animate-pulse text-amber-400" />
              <span>PAPER MODE (SANDBOX)</span>
            </div>
          ) : executionMode === 'LIVE_BLOCKED' ? (
            <div
              id="badge-live-blocked"
              className="flex items-center space-x-1.5 px-2.5 py-1 bg-red-950/40 border border-red-800/60 rounded text-red-300 font-mono text-xs font-semibold tracking-wide"
              title="Real-money execution is hard-blocked by institutional risk governance."
            >
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              <span>LIVE TRADING BLOCKED</span>
            </div>
          ) : (
            <div
              id="badge-offline-mode"
              className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded text-slate-400 font-mono text-xs font-semibold"
            >
              <Wifi className="w-3.5 h-3.5 text-slate-500" />
              <span>OFFLINE</span>
            </div>
          )}
        </div>
      </div>

      {/* Center Market & Health Telemetry */}
      <div className="hidden lg:flex items-center space-x-6 text-xs font-mono">
        <div>
          <span className="text-slate-400 mr-2">PORTFOLIO EQUITY:</span>
          <span className="text-slate-100 font-semibold">${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        </div>
        <div>
          <span className="text-slate-400 mr-2">DAY P&L:</span>
          <span className={`font-semibold ${dailyPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {dailyPnL >= 0 ? '+' : ''}${dailyPnL.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center space-x-1.5">
          <Activity className={`w-3.5 h-3.5 ${isStaleData ? 'text-rose-400' : 'text-emerald-400'}`} />
          <span className="text-slate-400">DATA FEED:</span>
          <span className={isStaleData ? 'text-rose-400 font-bold' : 'text-emerald-400 font-medium'}>
            {isStaleData ? 'STALE (>3000ms)' : 'SIMULATED (45ms)'}
          </span>
        </div>
      </div>

      {/* Emergency Kill Switch Button */}
      <div className="flex items-center space-x-3">
        {isEmergency ? (
          <div className="flex items-center space-x-2 bg-rose-950/80 border border-rose-600 px-3 py-1.5 rounded text-rose-200 text-xs font-mono animate-pulse">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span className="font-bold">SYSTEM HALTED BY KILL SWITCH</span>
          </div>
        ) : (
          <button
            id="btn-emergency-kill-switch-header"
            onClick={onTriggerKillSwitch}
            className="flex items-center space-x-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white px-3 py-1.5 rounded text-xs font-semibold tracking-wider transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            title="Immediately halt all order execution and freeze active strategies."
          >
            <ShieldAlert className="w-4 h-4" />
            <span>KILL SWITCH</span>
          </button>
        )}
      </div>
    </header>
  );
};
