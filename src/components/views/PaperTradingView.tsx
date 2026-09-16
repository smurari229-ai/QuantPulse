import React, { useState } from 'react';
import { OrderRequest, PortfolioState, RiskValidationVerdict } from '../../types/order';
import { MarketDataSnapshot } from '../../types/market';
import { executePaperOrder } from '../../engines/paperTradingEngine';
import { evaluateRiskGates } from '../../engines/riskEngine';
import { ClipboardList, ShieldAlert, CheckCircle2, AlertTriangle, ArrowRight, DollarSign, RefreshCw } from 'lucide-react';

interface PaperTradingViewProps {
  portfolio: PortfolioState;
  marketSnapshot: MarketDataSnapshot;
  onOrderExecuted: (newPortfolio: PortfolioState, executedOrder: OrderRequest) => void;
  onRiskVerdictGenerated: (verdict: RiskValidationVerdict) => void;
}

export const PaperTradingView: React.FC<PaperTradingViewProps> = ({
  portfolio,
  marketSnapshot,
  onOrderExecuted,
  onRiskVerdictGenerated,
}) => {
  const [symbol, setSymbol] = useState<string>(marketSnapshot.symbol);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'STOP'>('MARKET');
  const [quantity, setQuantity] = useState<number>(10);
  const [limitPrice, setLimitPrice] = useState<number>(Number(marketSnapshot.lastPrice.toFixed(2)));
  const [stopLossPrice, setStopLossPrice] = useState<number>(Number((marketSnapshot.lastPrice * 0.96).toFixed(2)));
  const [takeProfitPrice, setTakeProfitPrice] = useState<number>(Number((marketSnapshot.lastPrice * 1.08).toFixed(2)));
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const notionalValue = quantity * (orderType === 'LIMIT' ? limitPrice : marketSnapshot.lastPrice);
  const estimatedSlippage = notionalValue * 0.00045; // 4.5 bps
  const estimatedBrokerage = notionalValue * 0.0003; // 0.03%
  const estimatedSTT = notionalValue * 0.00012; // 0.012%
  const totalFriction = estimatedSlippage + estimatedBrokerage + estimatedSTT;

  const handleSubmitOrder = () => {
    setIsSubmitting(true);
    const newOrderId = `ORD-${Date.now().toString().slice(-6)}`;
    const proposedOrder: OrderRequest = {
      id: newOrderId,
      orderId: newOrderId,
      clientOrderId: `CLI-${Date.now()}`,
      symbol,
      side,
      type: orderType,
      quantity,
      limitPrice: orderType === 'LIMIT' ? limitPrice : marketSnapshot.lastPrice,
      stopLossPrice,
      takeProfitPrice,
      executionMode: 'PAPER',
      timestamp: Date.now(),
      aiDecisionId: 'MANUAL_PAPER_DESK',
    };

    // Step 1: Pre-trade Risk Interception
    const verdict = evaluateRiskGates(proposedOrder, portfolio, marketSnapshot);
    onRiskVerdictGenerated(verdict);

    if (!verdict.isApproved) {
      setExecutionLog((prev) => [
        `[${new Date().toLocaleTimeString()}] REJECTED by Risk Engine: ${verdict.rejectionReasons.join('; ')}`,
        ...prev,
      ]);
      setIsSubmitting(false);
      return;
    }

    // Step 2: Paper Execution Simulation
    setTimeout(() => {
      const execResult = executePaperOrder(proposedOrder, portfolio, marketSnapshot);
      if (execResult.status === 'FILLED' && execResult.fill) {
        setExecutionLog((prev) => [
          `[${new Date().toLocaleTimeString()}] FILLED: ${side} ${quantity} ${symbol} @ $${execResult.fill!.price.toFixed(2)} (Slippage: $${execResult.fill!.slippageBps} bps, Fees: $${(execResult.fill!.brokerageFee + execResult.fill!.exchangeFee).toFixed(2)}) - Token: ${verdict.auditableRiskToken.slice(0, 10)}...`,
          ...prev,
        ]);
        onOrderExecuted(execResult.updatedPortfolio, proposedOrder);
      } else {
        setExecutionLog((prev) => [
          `[${new Date().toLocaleTimeString()}] EXECUTION FAILED: ${execResult.rejectionReason}`,
          ...prev,
        ]);
      }
      setIsSubmitting(false);
    }, 350);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <ClipboardList className="w-5 h-5 text-amber-400" />
            <h2 className="text-sm font-semibold text-slate-100">Paper Trading Execution Console</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Realistic order fill simulation factoring execution latency, realistic bid-ask bounce, slippage, brokerage, and transaction taxes.
          </p>
        </div>
        <div className="flex items-center space-x-2 font-mono text-xs px-2.5 py-1 bg-amber-950/40 border border-amber-500/30 rounded text-amber-300">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span>SIMULATED SANDBOX (REAL MONEY LOCKED)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Submission Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 lg:col-span-2">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="text-xs font-mono font-bold text-slate-200">ORDER TICKET SPECIFICATION</h3>
            <span className="text-[11px] font-mono text-slate-400">Target Asset: {symbol}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 font-mono text-xs">
            <div>
              <label className="text-slate-400 text-[10px] block mb-1">SIDE</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setSide('BUY')}
                  className={`py-1.5 rounded font-bold transition-colors ${
                    side === 'BUY'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setSide('SELL')}
                  className={`py-1.5 rounded font-bold transition-colors ${
                    side === 'SELL'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>

            <div>
              <label className="text-slate-400 text-[10px] block mb-1">ORDER TYPE</label>
              <select
                value={orderType}
                onChange={(e) => setOrderType(e.target.value as 'MARKET' | 'LIMIT' | 'STOP')}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="MARKET">MARKET</option>
                <option value="LIMIT">LIMIT</option>
                <option value="STOP">STOP</option>
              </select>
            </div>

            <div>
              <label className="text-slate-400 text-[10px] block mb-1">QUANTITY</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            {orderType === 'LIMIT' && (
              <div>
                <label className="text-slate-400 text-[10px] block mb-1">LIMIT PRICE ($)</label>
                <input
                  type="number"
                  step="0.05"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <div>
              <label className="text-slate-400 text-[10px] block mb-1">
                MANDATORY STOP-LOSS ($) <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                step="0.05"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-rose-300 focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="text-slate-400 text-[10px] block mb-1">
                TAKE-PROFIT TARGET ($) <span className="text-emerald-400">*</span>
              </label>
              <input
                type="number"
                step="0.05"
                value={takeProfitPrice}
                onChange={(e) => setTakeProfitPrice(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-emerald-300 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Friction Modeling Breakdown */}
          <div className="p-3.5 bg-slate-950/60 rounded border border-slate-800 space-y-2 font-mono text-xs">
            <span className="text-slate-400 text-[11px] font-bold block uppercase">
              Realistic Pre-Trade Friction & Margin Calculation:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div>
                <span className="text-slate-500 block">Gross Notional:</span>
                <span className="text-slate-200 font-bold">${notionalValue.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Est. Slippage (4.5 bps):</span>
                <span className="text-amber-400 font-semibold">${estimatedSlippage.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Brokerage & Taxes:</span>
                <span className="text-amber-400 font-semibold">${(estimatedBrokerage + estimatedSTT).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Total Est. Friction:</span>
                <span className="text-rose-400 font-bold">${totalFriction.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmitOrder}
            disabled={isSubmitting}
            className={`w-full py-2.5 rounded font-bold font-mono text-xs transition-colors flex items-center justify-center space-x-2 shadow-sm ${
              side === 'BUY'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-rose-600 hover:bg-rose-700 text-white'
            }`}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Evaluating 15 Risk Gates...</span>
              </>
            ) : (
              <>
                <ArrowRight className="w-4 h-4" />
                <span>SUBMIT {side} ORDER TO RISK ENGINE</span>
              </>
            )}
          </button>
        </div>

        {/* Real-time Order Fill & Execution Stream */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col space-y-3">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <h3 className="text-xs font-mono font-bold text-slate-200">EXECUTION AUDIT STREAM</h3>
            <span className="text-[10px] font-mono text-slate-500">{executionLog.length} Events</span>
          </div>

          <div className="flex-1 bg-slate-950/80 rounded border border-slate-800/80 p-2.5 overflow-y-auto max-h-80 space-y-2 text-[11px] font-mono">
            {executionLog.length === 0 ? (
              <div className="text-slate-600 text-center py-10">
                Awaiting order submission. Every fill is auditable and stamped with a cryptographic risk token.
              </div>
            ) : (
              executionLog.map((log, index) => (
                <div key={index} className="p-2 bg-slate-900/60 rounded border border-slate-800/60 text-slate-300">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
