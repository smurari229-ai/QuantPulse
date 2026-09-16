import React, { useState } from 'react';
import { OrderRequest } from '../../types/order';
import { History, ShieldCheck, Download, Filter } from 'lucide-react';

interface OrdersHistoryViewProps {
  orders: OrderRequest[];
}

export const OrdersHistoryView: React.FC<OrdersHistoryViewProps> = ({ orders }) => {
  const [filterMode, setFilterMode] = useState<string>('ALL');

  const filteredOrders = filterMode === 'ALL'
    ? orders
    : orders.filter((o) => o.side === filterMode);

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-blue-400" />
            <h2 className="text-sm font-semibold text-slate-100">Order Ledger & Execution History</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Complete sequence of all generated order tickets with deterministic risk token linkages.
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center space-x-2 font-mono text-xs">
          <span className="text-slate-400 text-[11px]">Side Filter:</span>
          {['ALL', 'BUY', 'SELL'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterMode(f)}
              className={`px-2.5 py-1 rounded text-[11px] ${
                filterMode === f
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-950/40 border-b border-slate-800 flex justify-between items-center text-xs font-mono">
          <span className="text-slate-300 font-bold">Total Orders Recorded: {filteredOrders.length}</span>
          <span className="text-[11px] text-slate-500">Execution Mode: PAPER SIMULATION</span>
        </div>

        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs font-mono">
            Zero orders recorded in session ledger. Submit simulated orders via Paper Trading Console.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/60 text-slate-400 border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="px-4 py-2.5">ORDER ID</th>
                  <th className="px-4 py-2.5">TIMESTAMP</th>
                  <th className="px-4 py-2.5">SYMBOL</th>
                  <th className="px-4 py-2.5">SIDE</th>
                  <th className="px-4 py-2.5">TYPE</th>
                  <th className="px-4 py-2.5">QTY</th>
                  <th className="px-4 py-2.5">STOP LOSS</th>
                  <th className="px-4 py-2.5">TAKE PROFIT</th>
                  <th className="px-4 py-2.5">AI LINK ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredOrders.map((ord) => (
                  <tr key={ord.orderId} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-100">{ord.orderId}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(ord.timestamp).toLocaleTimeString()}</td>
                    <td className="px-4 py-3 font-bold">{ord.symbol}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                        ord.side === 'BUY'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-950 text-rose-400 border border-rose-500/30'
                      }`}>
                        {ord.side}
                      </span>
                    </td>
                    <td className="px-4 py-3">{ord.type}</td>
                    <td className="px-4 py-3 text-slate-100 font-semibold">{ord.quantity}</td>
                    <td className="px-4 py-3 text-rose-400">${ord.stopLossPrice?.toFixed(2) || 'N/A'}</td>
                    <td className="px-4 py-3 text-emerald-400">${ord.takeProfitPrice?.toFixed(2) || 'N/A'}</td>
                    <td className="px-4 py-3 text-[10px] text-slate-500 font-mono">{ord.aiDecisionId || 'MANUAL'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
