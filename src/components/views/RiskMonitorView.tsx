import React, { useState } from 'react';
import { RiskValidationVerdict, OrderRequest, PortfolioState } from '../../types/order';
import { MarketDataSnapshot } from '../../types/market';
import { evaluateRiskGates, DEFAULT_RISK_CONFIG } from '../../engines/riskEngine';
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, XCircle, Sliders, Play, Key } from 'lucide-react';

interface RiskMonitorViewProps {
  currentVerdict: RiskValidationVerdict;
  portfolio: PortfolioState;
  marketSnapshot: MarketDataSnapshot;
  onNewVerdict: (verdict: RiskValidationVerdict) => void;
}

export const RiskMonitorView: React.FC<RiskMonitorViewProps> = ({
  currentVerdict,
  portfolio,
  marketSnapshot,
  onNewVerdict,
}) => {
  // Test Order state for interactive experimentation
  const [testSymbol, setTestSymbol] = useState<string>(marketSnapshot.symbol);
  const [testSide, setTestSide] = useState<'BUY' | 'SELL'>('BUY');
  const [testQty, setTestQty] = useState<number>(10);
  const [testStopLoss, setTestStopLoss] = useState<number>(Math.round(marketSnapshot.lastPrice * 0.96));
  const [testTakeProfit, setTestTakeProfit] = useState<number>(Math.round(marketSnapshot.lastPrice * 1.08));

  const handleRunRiskEvaluation = () => {
    const testOrder: OrderRequest = {
      id: `ORD-TEST-${Date.now().toString().slice(-4)}`,
      orderId: `ORD-TEST-${Date.now().toString().slice(-4)}`,
      clientOrderId: `CLI-TEST-${Date.now()}`,
      symbol: testSymbol,
      side: testSide,
      type: 'MARKET',
      quantity: testQty,
      limitPrice: marketSnapshot.lastPrice,
      stopLossPrice: testStopLoss,
      takeProfitPrice: testTakeProfit,
      executionMode: 'PAPER',
      timestamp: Date.now(),
      aiDecisionId: 'AI-TEST-INTERACTIVE',
    };

    const verdict = evaluateRiskGates(testOrder, portfolio, marketSnapshot, {}, DEFAULT_RISK_CONFIG);
    onNewVerdict(verdict);
  };

  const passCount = currentVerdict.checks.filter((c) => c.status === 'PASS').length;
  const failCount = currentVerdict.checks.filter((c) => c.status === 'FAILED').length;
  const cautionCount = currentVerdict.checks.filter((c) => c.status === 'CAUTION').length;

  return (
    <div className="space-y-6">
      {/* Top Banner: Deterministic Gate Verdict */}
      <div className={`p-4 rounded-lg border flex flex-wrap items-center justify-between gap-4 font-mono ${
        currentVerdict.isApproved
          ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300'
          : 'bg-rose-950/40 border-rose-500/80 text-rose-200'
      }`}>
        <div className="flex items-center space-x-3">
          {currentVerdict.isApproved ? (
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          ) : (
            <ShieldAlert className="w-8 h-8 text-rose-400" />
          )}
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold">
                {currentVerdict.isApproved ? 'RISK VERDICT: ORDER APPROVED FOR EXECUTION' : 'RISK VERDICT: ORDER INTERCEPTED & REJECTED'}
              </h2>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Rule 5 Compliance: Deterministic pre-trade checks strictly override all upstream AI decisions.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4 text-xs">
          <div>
            <span className="text-slate-400">PASSED GATES: </span>
            <span className="font-bold text-emerald-400">{passCount} / 15</span>
          </div>
          <div>
            <span className="text-slate-400">FAILED GATES: </span>
            <span className="font-bold text-rose-400">{failCount}</span>
          </div>
          <div>
            <span className="text-slate-400">AUDIT TOKEN: </span>
            <span className="font-mono text-slate-200 bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-[10px]">
              {currentVerdict.auditableRiskToken.slice(0, 16)}...
            </span>
          </div>
        </div>
      </div>

      {/* Rejection Banners if Failed */}
      {!currentVerdict.isApproved && currentVerdict.rejectionReasons.length > 0 && (
        <div className="bg-rose-950/60 border border-rose-600 rounded-lg p-4 text-xs font-mono space-y-2">
          <div className="flex items-center space-x-2 text-rose-300 font-bold">
            <XCircle className="w-4 h-4 text-rose-400" />
            <span>CRITICAL REJECTION REASONS ({currentVerdict.rejectionReasons.length}):</span>
          </div>
          <ul className="list-disc pl-5 space-y-1 text-rose-200">
            {currentVerdict.rejectionReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Interactive Risk Playground: Test Order through Gates */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center space-x-2 text-xs font-mono font-bold text-slate-200">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span>INTERACTIVE PRE-TRADE RISK INTERCEPTION TESTER</span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Test risk limits against proposed parameters</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
          <div>
            <label className="text-slate-400 text-[10px] block mb-1">SYMBOL</label>
            <input
              type="text"
              value={testSymbol}
              onChange={(e) => setTestSymbol(e.target.value.toUpperCase())}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs"
            />
          </div>
          <div>
            <label className="text-slate-400 text-[10px] block mb-1">SIDE</label>
            <select
              value={testSide}
              onChange={(e) => setTestSide(e.target.value as 'BUY' | 'SELL')}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs"
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-[10px] block mb-1">QUANTITY</label>
            <input
              type="number"
              value={testQty}
              onChange={(e) => setTestQty(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs"
            />
          </div>
          <div>
            <label className="text-slate-400 text-[10px] block mb-1">STOP LOSS ($)</label>
            <input
              type="number"
              value={testStopLoss}
              onChange={(e) => setTestStopLoss(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs"
            />
          </div>
          <div>
            <label className="text-slate-400 text-[10px] block mb-1">TAKE PROFIT ($)</label>
            <input
              type="number"
              value={testTakeProfit}
              onChange={(e) => setTestTakeProfit(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleRunRiskEvaluation}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded text-xs transition-colors flex items-center justify-center space-x-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Evaluate</span>
            </button>
          </div>
        </div>
      </div>

      {/* Complete 15 Risk Gates Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-950/40 border-b border-slate-800 flex justify-between items-center text-xs font-mono">
          <div className="flex items-center space-x-2">
            <h3 className="font-bold text-slate-200">The 15 Mandatory Pre-Trade Risk Gates</h3>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
              Standard Institutional Hard-Stops
            </span>
          </div>
          <span className="text-slate-400 text-[11px]">Evaluation Mode: Real-Time Deterministic</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-2.5">GATE #</th>
                <th className="px-4 py-2.5">RISK CHECK NAME</th>
                <th className="px-4 py-2.5">STATUS</th>
                <th className="px-4 py-2.5">MEASURED VALUE</th>
                <th className="px-4 py-2.5">MANDATED CEILING</th>
                <th className="px-4 py-2.5">AUDIT RATIONALE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {currentVerdict.checks.map((check, index) => {
                const isPass = check.status === 'PASS';
                const isCaution = check.status === 'CAUTION';
                return (
                  <tr key={check.gateId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-500">#{index + 1}</td>
                    <td className="px-4 py-3 font-bold text-slate-200">
                      {check.gateName}
                    </td>
                    <td className="px-4 py-3">
                      {isPass ? (
                        <span className="flex items-center space-x-1 text-emerald-400 font-bold bg-emerald-950/50 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] w-fit">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>PASS</span>
                        </span>
                      ) : isCaution ? (
                        <span className="flex items-center space-x-1 text-amber-400 font-bold bg-amber-950/50 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] w-fit">
                          <AlertTriangle className="w-3 h-3" />
                          <span>CAUTION</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-rose-400 font-bold bg-rose-950/80 border border-rose-500/80 px-2 py-0.5 rounded text-[10px] w-fit">
                          <XCircle className="w-3 h-3" />
                          <span>REJECTED</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-100 font-semibold">{check.currentValue}</td>
                    <td className="px-4 py-3 text-slate-400">{check.threshold}</td>
                    <td className="px-4 py-3 text-[11px] text-slate-300">{check.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
