import React, { useState } from 'react';
import { PortfolioState, OrderRequest, RiskValidationVerdict } from '../../types/order';
import { MarketDataSnapshot } from '../../types/market';
import { evaluateRiskGates } from '../../engines/riskEngine';
import { triggerEmergencyKillSwitch, KillSwitchState } from '../../engines/killSwitchEngine';
import { Flame, ShieldAlert, CheckCircle2, AlertTriangle, Play, RefreshCw, XCircle } from 'lucide-react';

interface FailureSimulatorViewProps {
  portfolio: PortfolioState;
  marketSnapshot: MarketDataSnapshot;
  onUpdateSnapshot: (snap: MarketDataSnapshot) => void;
  onUpdateKillSwitch: (ks: KillSwitchState) => void;
  onRiskVerdictGenerated: (verdict: RiskValidationVerdict) => void;
}

export const FailureSimulatorView: React.FC<FailureSimulatorViewProps> = ({
  portfolio,
  marketSnapshot,
  onUpdateSnapshot,
  onUpdateKillSwitch,
  onRiskVerdictGenerated,
}) => {
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [simLogs, setSimLogs] = useState<string[]>([]);

  const runScenario = (scenarioId: string) => {
    setActiveScenario(scenarioId);

    if (scenarioId === 'STALE_DATA') {
      // Degrade snapshot to 5200ms latency and stale flag
      const staleSnap: MarketDataSnapshot = {
        ...marketSnapshot,
        timestamp: Date.now() - 5200,
        dataQuality: {
          ...marketSnapshot.dataQuality,
          latencyMs: 5200,
          isStale: true,
        },
      };
      onUpdateSnapshot(staleSnap);

      // Attempt order
      const dummyOrder: OrderRequest = {
        id: `SIM-ORD-${Date.now().toString().slice(-4)}`,
        orderId: `SIM-ORD-${Date.now().toString().slice(-4)}`,
        clientOrderId: `CLI-SIM-${Date.now()}`,
        symbol: marketSnapshot.symbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: 10,
        limitPrice: marketSnapshot.lastPrice,
        stopLossPrice: marketSnapshot.lastPrice * 0.95,
        takeProfitPrice: marketSnapshot.lastPrice * 1.05,
        executionMode: 'PAPER',
        timestamp: Date.now(),
      };
      const verdict = evaluateRiskGates(dummyOrder, portfolio, staleSnap);
      onRiskVerdictGenerated(verdict);
      setSimLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] INJECTED: 5200ms Latency Feed. Risk Gate STALE_DATA_GUARD failed. Order rejected instantly.`,
        ...prev,
      ]);
    } else if (scenarioId === 'EXCESS_SIZE') {
      // Submit order that breaches max position size ($25,000 ceiling)
      const hugeOrder: OrderRequest = {
        id: `SIM-ORD-${Date.now().toString().slice(-4)}`,
        orderId: `SIM-ORD-${Date.now().toString().slice(-4)}`,
        clientOrderId: `CLI-SIM-${Date.now()}`,
        symbol: marketSnapshot.symbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: 50, // 50 * ~24000 = ~$1,200,000
        limitPrice: marketSnapshot.lastPrice,
        stopLossPrice: marketSnapshot.lastPrice * 0.95,
        takeProfitPrice: marketSnapshot.lastPrice * 1.05,
        executionMode: 'PAPER',
        timestamp: Date.now(),
      };
      const verdict = evaluateRiskGates(hugeOrder, portfolio, marketSnapshot);
      onRiskVerdictGenerated(verdict);
      setSimLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] INJECTED: Huge Notional Order ($${(50 * marketSnapshot.lastPrice).toFixed(0)}). Risk Gate MAX_POSITION_SIZE breached. Order rejected.`,
        ...prev,
      ]);
    } else if (scenarioId === 'MISSING_STOP_LOSS') {
      // Submit order with stopLoss = 0
      const noSlOrder: OrderRequest = {
        id: `SIM-ORD-${Date.now().toString().slice(-4)}`,
        orderId: `SIM-ORD-${Date.now().toString().slice(-4)}`,
        clientOrderId: `CLI-SIM-${Date.now()}`,
        symbol: marketSnapshot.symbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: 5,
        limitPrice: marketSnapshot.lastPrice,
        stopLossPrice: 0, // INVALID
        takeProfitPrice: marketSnapshot.lastPrice * 1.05,
        executionMode: 'PAPER',
        timestamp: Date.now(),
      };
      const verdict = evaluateRiskGates(noSlOrder, portfolio, marketSnapshot);
      onRiskVerdictGenerated(verdict);
      setSimLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] INJECTED: Order with Stop-Loss = $0. Gate MANDATORY_STOP_LOSS failed. Order rejected.`,
        ...prev,
      ]);
    } else if (scenarioId === 'DAILY_LOSS_BREACH') {
      // Simulate portfolio with -3.5% daily drawdown
      const lossPortfolio: PortfolioState = {
        ...portfolio,
        dailyPnL: -3500,
        dailyPnLPct: -3.5,
      };
      const normalOrder: OrderRequest = {
        id: `SIM-ORD-${Date.now().toString().slice(-4)}`,
        orderId: `SIM-ORD-${Date.now().toString().slice(-4)}`,
        clientOrderId: `CLI-SIM-${Date.now()}`,
        symbol: marketSnapshot.symbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: 2,
        limitPrice: marketSnapshot.lastPrice,
        stopLossPrice: marketSnapshot.lastPrice * 0.95,
        takeProfitPrice: marketSnapshot.lastPrice * 1.05,
        executionMode: 'PAPER',
        timestamp: Date.now(),
      };
      const verdict = evaluateRiskGates(normalOrder, lossPortfolio, marketSnapshot);
      onRiskVerdictGenerated(verdict);
      setSimLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] INJECTED: Portfolio Daily Loss -3.5%. Circuit Breaker Gate MAX_DAILY_LOSS triggered. Order blocked.`,
        ...prev,
      ]);
    } else if (scenarioId === 'EMERGENCY_STOP_SIM') {
      const updated = triggerEmergencyKillSwitch('Automated simulation failure test', portfolio);
      onUpdateKillSwitch(updated);
      setSimLogs((prev) => [
        `[${new Date().toLocaleTimeString()}] TRIGGERED: Emergency Kill Switch Tripped! All order execution locked until dual auth reset.`,
        ...prev,
      ]);
    }
  };

  const handleRestoreNormal = () => {
    const normalSnap: MarketDataSnapshot = {
      ...marketSnapshot,
      timestamp: Date.now(),
      dataQuality: {
        ...marketSnapshot.dataQuality,
        latencyMs: 38,
        isStale: false,
      },
    };
    onUpdateSnapshot(normalSnap);
    setActiveScenario(null);
    setSimLogs((prev) => [
      `[${new Date().toLocaleTimeString()}] RESTORED: Feed latency reset to 38ms (Fresh). System in normal state.`,
      ...prev,
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Flame className="w-5 h-5 text-rose-400" />
            <h2 className="text-sm font-semibold text-slate-100">Failure State & Chaos Engineering Simulation Lab</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Validate the platform's deterministic resilience under adverse market conditions, stale feeds, invalid orders, and circuit breakers.
          </p>
        </div>

        <button
          onClick={handleRestoreNormal}
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono font-semibold transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
          <span>Restore Normal System State</span>
        </button>
      </div>

      {/* Scenarios Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
        {/* Scenario 1: Stale Data Feed */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-start">
            <span className="font-bold text-slate-200">Scenario #1: Feed Latency &gt; 3000ms</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800">
              STALE FEED
            </span>
          </div>
          <p className="text-slate-400 text-[11px]">
            Simulates a 5200ms market data lag. The Risk Engine must instantly fail Gate #11 and block order execution.
          </p>
          <button
            onClick={() => runScenario('STALE_DATA')}
            className="w-full py-1.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 rounded font-semibold transition-colors flex items-center justify-center space-x-1"
          >
            <Play className="w-3 h-3" />
            <span>Inject Stale Data Spike</span>
          </button>
        </div>

        {/* Scenario 2: Oversized Position */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-start">
            <span className="font-bold text-slate-200">Scenario #2: Position Size Limit Breach</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
              OVERSIZE
            </span>
          </div>
          <p className="text-slate-400 text-[11px]">
            Submits an order exceeding the $25,000 maximum notional ceiling. The Risk Engine must reject the order at Gate #1.
          </p>
          <button
            onClick={() => runScenario('EXCESS_SIZE')}
            className="w-full py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-300 rounded font-semibold transition-colors flex items-center justify-center space-x-1"
          >
            <Play className="w-3 h-3" />
            <span>Inject Oversized Order</span>
          </button>
        </div>

        {/* Scenario 3: Missing Stop-Loss */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-start">
            <span className="font-bold text-slate-200">Scenario #3: Missing Stop-Loss Order</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
              SAFETY GAP
            </span>
          </div>
          <p className="text-slate-400 text-[11px]">
            Submits an order without a valid pre-defined stop loss price. Risk Gate #13 must immediately reject.
          </p>
          <button
            onClick={() => runScenario('MISSING_STOP_LOSS')}
            className="w-full py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded font-semibold transition-colors flex items-center justify-center space-x-1"
          >
            <Play className="w-3 h-3" />
            <span>Inject Zero Stop-Loss Order</span>
          </button>
        </div>

        {/* Scenario 4: Daily Loss Limit */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-start">
            <span className="font-bold text-slate-200">Scenario #4: Daily Circuit Breaker (-3.0%)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800">
              CIRCUIT BREAKER
            </span>
          </div>
          <p className="text-slate-400 text-[11px]">
            Simulates a portfolio reaching -3.5% daily drawdown. The Risk Engine must halt all new trades for the session.
          </p>
          <button
            onClick={() => runScenario('DAILY_LOSS_BREACH')}
            className="w-full py-1.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 rounded font-semibold transition-colors flex items-center justify-center space-x-1"
          >
            <Play className="w-3 h-3" />
            <span>Simulate Daily Loss Breach</span>
          </button>
        </div>

        {/* Scenario 5: Emergency Stop Trip */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-start">
            <span className="font-bold text-slate-200">Scenario #5: Immediate Kill Switch Trip</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950 text-red-400 border border-red-800">
              KILL SWITCH
            </span>
          </div>
          <p className="text-slate-400 text-[11px]">
            Instantly trips the emergency stop. The platform freezes, generates a dual auth code, and locks the order router.
          </p>
          <button
            onClick={() => runScenario('EMERGENCY_STOP_SIM')}
            className="w-full py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-semibold transition-colors flex items-center justify-center space-x-1"
          >
            <Play className="w-3 h-3" />
            <span>Trip Emergency Kill Switch</span>
          </button>
        </div>
      </div>

      {/* Simulation Telemetry Output Console */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2 font-mono text-xs">
        <div className="flex justify-between items-center border-b border-slate-800 pb-2">
          <span className="font-bold text-slate-200">SIMULATION LOG AUDIT STREAM</span>
          <span className="text-[10px] text-slate-500">Real-time telemetry</span>
        </div>
        <div className="bg-slate-950/80 p-3 rounded border border-slate-800/80 max-h-56 overflow-y-auto space-y-2 text-[11px]">
          {simLogs.length === 0 ? (
            <div className="text-slate-600 text-center py-6">
              Select any failure injection above to witness deterministic safety interception.
            </div>
          ) : (
            simLogs.map((log, index) => (
              <div key={index} className="p-2 bg-slate-900/60 rounded border border-slate-800/60 text-slate-300">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
