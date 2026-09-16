import React, { useState } from 'react';
import { PortfolioState, OrderRequest, RiskValidationVerdict } from '../../types/order';
import { MarketDataSnapshot } from '../../types/market';
import { evaluateRiskGates } from '../../engines/riskEngine';
import { triggerEmergencyKillSwitch, KillSwitchState } from '../../engines/killSwitchEngine';
import { Flame, Play, RefreshCw } from 'lucide-react';

interface FailureSimulatorViewProps { portfolio: PortfolioState; marketSnapshot: MarketDataSnapshot; onUpdateSnapshot: (snap: MarketDataSnapshot) => void; onUpdateKillSwitch: (ks: KillSwitchState) => void; onRiskVerdictGenerated: (verdict: RiskValidationVerdict) => void; }

export const FailureSimulatorView: React.FC<FailureSimulatorViewProps> = ({ portfolio, marketSnapshot, onUpdateSnapshot, onUpdateKillSwitch, onRiskVerdictGenerated }) => {
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [simLogs, setSimLogs] = useState<string[]>([]);
  const makeOrder = (overrides: Partial<OrderRequest> = {}): OrderRequest => ({ id: `SIM-ORD-${Date.now().toString().slice(-6)}`, orderId: `SIM-ORD-${Date.now().toString().slice(-6)}`, clientOrderId: `CLI-SIM-${Date.now()}`, symbol: marketSnapshot.symbol, side: 'BUY', type: 'MARKET', quantity: 2, limitPrice: marketSnapshot.lastPrice, stopLossPrice: marketSnapshot.lastPrice * 0.95, takeProfitPrice: marketSnapshot.lastPrice * 1.05, executionMode: 'PAPER', timestamp: Date.now(), ...overrides });
  const log = (text: string) => setSimLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);
  const runScenario = (scenarioId: string) => {
    setActiveScenario(scenarioId);
    if (scenarioId === 'STALE_DATA') {
      const stale = { ...marketSnapshot, timestamp: Date.now() - 5200, dataQuality: { ...marketSnapshot.dataQuality, latencyMs: 5200, isStale: true } };
      onUpdateSnapshot(stale); onRiskVerdictGenerated(evaluateRiskGates(makeOrder(), portfolio, stale)); log('INJECTED: 5200ms stale feed. Risk engine should reject the order.');
    } else if (scenarioId === 'EXCESS_SIZE') {
      const order = makeOrder({ quantity: 50 }); const verdict = evaluateRiskGates(order, portfolio, marketSnapshot); onRiskVerdictGenerated(verdict); log(`INJECTED: oversized order ($${(50 * marketSnapshot.lastPrice).toFixed(0)} notional). Risk engine should reject it.`);
    } else if (scenarioId === 'MISSING_STOP_LOSS') {
      const verdict = evaluateRiskGates(makeOrder({ quantity: 5, stopLossPrice: 0 }), portfolio, marketSnapshot); onRiskVerdictGenerated(verdict); log('INJECTED: order with stop-loss = 0. Mandatory stop-loss gate should reject it.');
    } else if (scenarioId === 'DAILY_LOSS_BREACH') {
      const lossPortfolio = { ...portfolio, dailyPnL: -3500, dailyPnLPct: -3.5 }; const verdict = evaluateRiskGates(makeOrder(), lossPortfolio, marketSnapshot); onRiskVerdictGenerated(verdict); log('INJECTED: daily loss -3.5%. Daily loss circuit breaker should reject new orders.');
    } else if (scenarioId === 'EMERGENCY_STOP_SIM') {
      onUpdateKillSwitch(triggerEmergencyKillSwitch('Automated simulation failure test')); log('TRIGGERED: emergency kill switch. Paper order routing is now blocked until reset.');
    }
  };
  const restore = () => { onUpdateSnapshot({ ...marketSnapshot, timestamp: Date.now(), dataQuality: { ...marketSnapshot.dataQuality, latencyMs: 38, isStale: false } }); setActiveScenario(null); log('RESTORED: market feed marked fresh at 38ms.'); };
  const scenarios = [
    ['STALE_DATA','Feed Latency > 3000ms','Simulate stale market data.'],
    ['EXCESS_SIZE','Position Size Limit Breach','Submit an oversized paper order.'],
    ['MISSING_STOP_LOSS','Missing Stop-Loss Order','Submit an order without a valid stop.'],
    ['DAILY_LOSS_BREACH','Daily Circuit Breaker (-3.0%)','Simulate a daily loss breach.'],
    ['EMERGENCY_STOP_SIM','Immediate Kill Switch Trip','Trip the emergency sandbox stop.'],
  ];
  return <div className="space-y-6">
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4"><div><div className="flex items-center space-x-2"><Flame className="w-5 h-5 text-rose-400" /><h2 className="text-sm font-semibold text-slate-100">Failure State & Chaos Simulation Lab</h2></div><p className="text-xs text-slate-400 mt-1">Deterministic sandbox tests for stale feeds, invalid orders, circuit breakers and the kill switch.</p></div><button onClick={restore} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 text-slate-200 rounded text-xs font-semibold"><RefreshCw className="w-3.5 h-3.5" />Restore Normal State</button></div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{scenarios.map(([id,title,desc]) => <div key={id} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3"><div className="font-bold text-slate-200 text-xs">{title}</div><p className="text-slate-400 text-[11px]">{desc}</p><button onClick={() => runScenario(id)} className={`w-full py-1.5 rounded font-semibold flex items-center justify-center gap-1 ${activeScenario === id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-200'}`}><Play className="w-3 h-3" />Inject Scenario</button></div>)}</div>
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2 font-mono text-xs"><div className="border-b border-slate-800 pb-2 font-bold text-slate-200">SIMULATION LOG AUDIT STREAM</div><div className="bg-slate-950/80 p-3 rounded border border-slate-800/80 max-h-56 overflow-y-auto space-y-2 text-[11px]">{simLogs.length === 0 ? <div className="text-slate-600 text-center py-6">Select a failure injection.</div> : simLogs.map((entry, i) => <div key={i} className="p-2 bg-slate-900/60 rounded border border-slate-800/60 text-slate-300">{entry}</div>)}</div></div>
  </div>;
};
