import React, { useEffect, useRef, useState } from 'react';
import { OrderRequest, PortfolioState, RiskValidationVerdict, SystemExecutionMode } from '../../types/order';
import { MarketDataSnapshot } from '../../types/market';
import { RiskEngineConfig } from '../../types/risk';
import { executePaperOrder } from '../../engines/paperTradingEngine';
import { evaluateRiskGates, RecentOrderContext } from '../../engines/riskEngine';
import { ClipboardList, ShieldAlert, ArrowRight, RefreshCw } from 'lucide-react';

interface PaperTradingViewProps {
  executionMode: SystemExecutionMode;
  portfolio: PortfolioState;
  riskConfig: RiskEngineConfig;
  marketSnapshot: MarketDataSnapshot;
  isEmergencyKillSwitchActive?: boolean;
  riskContext: RecentOrderContext;
  onOrderExecuted: (newPortfolio: PortfolioState, executedOrder: OrderRequest) => void;
  onRiskVerdictGenerated: (verdict: RiskValidationVerdict) => void;
}

export const PaperTradingView: React.FC<PaperTradingViewProps> = ({ executionMode, portfolio, riskConfig, marketSnapshot, isEmergencyKillSwitchActive = false, riskContext, onOrderExecuted, onRiskVerdictGenerated }) => {
  const symbol = marketSnapshot.symbol;
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [quantity, setQuantity] = useState(10);
  const [limitPrice, setLimitPrice] = useState(Number(marketSnapshot.lastPrice.toFixed(2)));
  const [stopLossPrice, setStopLossPrice] = useState(Number((marketSnapshot.lastPrice * 0.96).toFixed(2)));
  const [takeProfitPrice, setTakeProfitPrice] = useState(Number((marketSnapshot.lastPrice * 1.08).toFixed(2)));
  const [executionLog, setExecutionLog] = useState<string[]>([]);

  useEffect(() => {
    setLimitPrice(Number(marketSnapshot.lastPrice.toFixed(2)));
    setStopLossPrice(Number((marketSnapshot.lastPrice * 0.96).toFixed(2)));
    setTakeProfitPrice(Number((marketSnapshot.lastPrice * 1.08).toFixed(2)));
  }, [marketSnapshot.symbol, marketSnapshot.lastPrice]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const killSwitchRef = useRef(isEmergencyKillSwitchActive);

  useEffect(() => {
    killSwitchRef.current = isEmergencyKillSwitchActive;
  }, [isEmergencyKillSwitchActive]);
  // Use the same conservative executable quote for both risk preflight and paper fill.
  const referencePrice = orderType === 'LIMIT' ? limitPrice : (side === 'BUY' ? marketSnapshot.ask : marketSnapshot.bid);
  const notionalValue = quantity * referencePrice;
  const estimatedSlippage = notionalValue * 0.00045;
  const estimatedBrokerage = notionalValue * 0.0003;
  const estimatedSTT = notionalValue * 0.00012;

  const handleSubmitOrder = () => {
    if (executionMode !== 'PAPER') { setExecutionLog(prev => [`[${new Date().toLocaleTimeString()}] REJECTED: Execution mode is ${executionMode}; paper orders are disabled.`, ...prev]); return; }
    if (isEmergencyKillSwitchActive) { setExecutionLog(prev => [`[${new Date().toLocaleTimeString()}] REJECTED: Emergency kill switch is active.`, ...prev]); return; }
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(referencePrice) || referencePrice <= 0) return;
    setIsSubmitting(true);
    const id = `ORD-${Date.now().toString().slice(-6)}`;
    const proposedOrder: OrderRequest = { id, orderId: id, clientOrderId: `CLI-${Date.now()}`, symbol, side, type: orderType, quantity, limitPrice: orderType === 'LIMIT' ? limitPrice : undefined, estimatedPrice: orderType === 'MARKET' ? referencePrice : undefined, stopLossPrice, takeProfitPrice, executionMode: 'PAPER', timestamp: Date.now(), aiDecisionId: 'MANUAL_PAPER_DESK' };
    const verdict = evaluateRiskGates(proposedOrder, portfolio, marketSnapshot, { ...riskContext, isEmergencyKillSwitchActive }, riskConfig);
    onRiskVerdictGenerated(verdict);
    if (!verdict.isApproved) { setExecutionLog(prev => [`[${new Date().toLocaleTimeString()}] REJECTED by Risk Engine: ${verdict.rejectionReasons.join('; ')}`, ...prev]); setIsSubmitting(false); return; }
    setTimeout(() => {
      const result = executePaperOrder(proposedOrder, portfolio, marketSnapshot, { isExecutionHalted: killSwitchRef.current, riskConfig, riskContext });
      if (result.status === 'FILLED' && result.fill) {
        setExecutionLog(prev => [`[${new Date().toLocaleTimeString()}] FILLED: ${side} ${quantity} ${symbol} @ $${result.fill!.price.toFixed(2)} (Slippage: ${result.fill!.slippageIncurredBps} bps, Fees: $${result.totalCharges.toFixed(2)}) - Token: ${verdict.auditableRiskToken.slice(0, 10)}...`, ...prev]);
        onOrderExecuted(result.updatedPortfolio, proposedOrder);
      } else setExecutionLog(prev => [`[${new Date().toLocaleTimeString()}] EXECUTION FAILED: ${result.rejectionReason || 'Unknown paper execution rejection'}`, ...prev]);
      setIsSubmitting(false);
    }, 350);
  };

  return <div className="space-y-6">
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4"><div><div className="flex items-center space-x-2"><ClipboardList className="w-5 h-5 text-amber-400" /><h2 className="text-sm font-semibold text-slate-100">Paper Trading Execution Console</h2></div><p className="text-xs text-slate-400 mt-1">Sandbox-only execution with modeled spread, slippage, brokerage and taxes.</p></div><div className="flex items-center space-x-2 font-mono text-xs px-2.5 py-1 bg-amber-950/40 border border-amber-500/30 rounded text-amber-300"><ShieldAlert className="w-4 h-4 text-amber-400" /><span>{isEmergencyKillSwitchActive ? 'KILL SWITCH ACTIVE — ORDERS BLOCKED' : 'SIMULATED SANDBOX (REAL MONEY LOCKED)'}</span></div></div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4 lg:col-span-2"><div className="flex justify-between items-center border-b border-slate-800 pb-3"><h3 className="text-xs font-mono font-bold text-slate-200">ORDER TICKET SPECIFICATION</h3><span className="text-[11px] font-mono text-slate-400">Target Asset: {symbol}</span></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 font-mono text-xs">
          <div><label className="text-slate-400 text-[10px] block mb-1">SIDE</label><div className="grid grid-cols-2 gap-1.5"><button type="button" onClick={() => setSide('BUY')} className={`py-1.5 rounded font-bold ${side === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}>BUY</button><button type="button" onClick={() => setSide('SELL')} className={`py-1.5 rounded font-bold ${side === 'SELL' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}`}>SELL</button></div></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">ORDER TYPE</label><select value={orderType} onChange={e => setOrderType(e.target.value as 'MARKET' | 'LIMIT')} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"><option value="MARKET">MARKET</option><option value="LIMIT">LIMIT</option></select></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">QUANTITY</label><input type="number" min="1" value={quantity} onChange={e => setQuantity(Math.max(1, Number(e.target.value)))} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200" /></div>
          {orderType === 'LIMIT' && <div><label className="text-slate-400 text-[10px] block mb-1">LIMIT PRICE ($)</label><input type="number" step="0.05" value={limitPrice} onChange={e => setLimitPrice(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200" /></div>}
          <div><label className="text-slate-400 text-[10px] block mb-1">MANDATORY STOP-LOSS ($) *</label><input type="number" step="0.05" value={stopLossPrice} onChange={e => setStopLossPrice(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-rose-300" /></div>
          <div><label className="text-slate-400 text-[10px] block mb-1">TAKE-PROFIT TARGET ($) *</label><input type="number" step="0.05" value={takeProfitPrice} onChange={e => setTakeProfitPrice(Number(e.target.value))} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-emerald-300" /></div>
        </div>
        <div className="p-3.5 bg-slate-950/60 rounded border border-slate-800 font-mono text-xs"><span className="text-slate-400 text-[11px] font-bold block uppercase mb-2">Pre-Trade Friction Estimate</span><div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]"><div><span className="text-slate-500 block">Gross Notional</span><span className="text-slate-200 font-bold">${notionalValue.toFixed(2)}</span></div><div><span className="text-slate-500 block">Est. Slippage</span><span className="text-amber-400 font-semibold">${estimatedSlippage.toFixed(2)}</span></div><div><span className="text-slate-500 block">Brokerage & Taxes</span><span className="text-amber-400 font-semibold">${(estimatedBrokerage + estimatedSTT).toFixed(2)}</span></div><div><span className="text-slate-500 block">Total Estimate</span><span className="text-rose-400 font-bold">${(estimatedSlippage + estimatedBrokerage + estimatedSTT).toFixed(2)}</span></div></div></div>
        <button type="button" onClick={handleSubmitOrder} disabled={isSubmitting || isEmergencyKillSwitchActive || executionMode !== 'PAPER'} className={`w-full py-2.5 rounded font-bold font-mono text-xs flex items-center justify-center space-x-2 ${isEmergencyKillSwitchActive ? 'bg-slate-700' : side === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'} text-white disabled:opacity-50`}>{isSubmitting ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>Evaluating Risk Gates...</span></> : <><ArrowRight className="w-4 h-4" /><span>{isEmergencyKillSwitchActive ? 'ORDERS BLOCKED BY KILL SWITCH' : executionMode !== 'PAPER' ? 'PAPER ORDERS DISABLED IN CURRENT MODE' : `SUBMIT ${side} ORDER TO RISK ENGINE`}</span></>}</button>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col space-y-3"><div className="flex justify-between items-center border-b border-slate-800 pb-2"><h3 className="text-xs font-mono font-bold text-slate-200">EXECUTION AUDIT STREAM</h3><span className="text-[10px] font-mono text-slate-500">{executionLog.length} Events</span></div><div className="flex-1 bg-slate-950/80 rounded border border-slate-800/80 p-2.5 overflow-y-auto max-h-80 space-y-2 text-[11px] font-mono">{executionLog.length === 0 ? <div className="text-slate-600 text-center py-10">Awaiting order submission.</div> : executionLog.map((log, index) => <div key={index} className="p-2 bg-slate-900/60 rounded border border-slate-800/60 text-slate-300">{log}</div>)}</div></div>
    </div>
  </div>;
};
