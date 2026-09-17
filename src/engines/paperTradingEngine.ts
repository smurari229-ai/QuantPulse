import { OrderRequest, OrderFill, Position, PortfolioState } from '../types/order';
import { MarketDataSnapshot } from '../types/market';

export interface PaperSimulationResult {
  order: OrderRequest;
  fill?: OrderFill;
  updatedPortfolio: PortfolioState;
  slippageIncurredBps: number;
  totalCharges: number;
  status: 'FILLED' | 'REJECTED';
  rejectionReason?: string;
}

export const INITIAL_PORTFOLIO_STATE: PortfolioState = {
  cash: 100000, initialCapital: 100000, equity: 100000, totalUnrealizedPnL: 0, totalRealizedPnL: 0,
  dailyPnL: 0, dailyPnLPct: 0, peakEquity: 100000, currentDrawdownPct: 0, marginUsed: 0,
  availableMargin: 100000, positionsCount: 0, portfolioExposurePct: 0, positions: [], lastUpdated: Date.now(),
};

export function executePaperOrder(order: OrderRequest, currentPortfolio: PortfolioState, marketSnapshot: MarketDataSnapshot, options?: { simulatedLatencyMs?: number; customSlippageBps?: number }): PaperSimulationResult {
  if (order.executionMode === 'LIVE_BLOCKED') return reject(order, currentPortfolio, 'Direct Live Execution is strictly blocked by platform governance.');
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) return reject(order, currentPortfolio, 'Order quantity must be a positive finite number.');
  if (marketSnapshot.bid <= 0 || marketSnapshot.ask <= 0) return reject(order, currentPortfolio, 'Invalid market bid/ask data.');

  const positionIndex = currentPortfolio.positions.findIndex(p => p.symbol === order.symbol);
  const existing = positionIndex >= 0 ? currentPortfolio.positions[positionIndex] : undefined;
  if (order.side === 'SELL' && !existing) return reject(order, currentPortfolio, `Cannot sell ${order.symbol}: no paper position exists.`);
  if (order.side === 'SELL' && existing && order.quantity > existing.quantity) return reject(order, currentPortfolio, `Cannot sell ${order.quantity} units: only ${existing.quantity} units are held.`);

  const slippageBps = options?.customSlippageBps ?? (order.side === 'BUY' ? 4.5 : 5);
  const factor = 1 + slippageBps / 10000;
  const rawPrice = order.estimatedPrice ?? (order.side === 'BUY' ? marketSnapshot.ask : marketSnapshot.bid);
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return reject(order, currentPortfolio, 'Invalid execution price.');
  const fillPrice = order.side === 'BUY' ? Math.round(rawPrice * factor * 100) / 100 : Math.round((rawPrice / factor) * 100) / 100;
  const value = fillPrice * order.quantity;
  const brokerFee = Math.max(20, Math.round(value * 0.0003 * 100) / 100);
  const exchangeFee = Math.round(value * 0.000035 * 100) / 100;
  const taxesApplicable = Math.round(value * 0.0001 * 100) / 100;
  const totalCharges = Math.round((brokerFee + exchangeFee + taxesApplicable) * 100) / 100;

  if (order.side === 'BUY' && currentPortfolio.cash < value + totalCharges) return reject(order, currentPortfolio, `Insufficient paper cash ($${currentPortfolio.cash.toFixed(2)} available, need $${(value + totalCharges).toFixed(2)}).`);

  const fill: OrderFill = {
    fillId: `FILL-PAPER-${Date.now().toString(36).toUpperCase()}`, orderId: order.id, symbol: order.symbol, side: order.side,
    quantity: order.quantity, price: fillPrice, slippageIncurredBps: slippageBps, slippageBps, brokerFee, brokerageFee: brokerFee,
    exchangeFee, taxesApplicable, totalCharges, timestamp: Date.now(), brokerOrderId: `MOCK-BRK-${Math.floor(Math.random() * 899999 + 100000)}`,
  };

  const positions: Position[] = currentPortfolio.positions.map(p => ({ ...p }));
  let cashDelta = 0;
  let realizedDelta = 0;

  if (order.side === 'BUY') {
    cashDelta = -(value + totalCharges);
    if (existing) {
      const p = positions[positionIndex];
      const totalQty = p.quantity + order.quantity;
      p.averageEntryPrice = Math.round(((p.averageEntryPrice * p.quantity + fillPrice * order.quantity) / totalQty) * 100) / 100;
      p.quantity = totalQty; p.currentPrice = marketSnapshot.lastPrice;
      p.stopLossPrice = order.stopLossPrice; p.takeProfitPrice = order.takeProfitPrice;
    } else {
      positions.push({ symbol: order.symbol, quantity: order.quantity, averageEntryPrice: fillPrice, currentPrice: marketSnapshot.lastPrice,
        marketValue: 0, unrealizedPnL: 0, unrealizedPnLPct: 0, realizedPnL: 0, stopLossPrice: order.stopLossPrice,
        takeProfitPrice: order.takeProfitPrice, notionalExposurePct: 0, highestPriceSinceEntry: fillPrice, openedAt: Date.now() });
    }
  } else if (existing) {
    cashDelta = value - totalCharges;
    realizedDelta = (fillPrice - existing.averageEntryPrice) * order.quantity - totalCharges;
    if (order.quantity === existing.quantity) positions.splice(positionIndex, 1);
    else { positions[positionIndex].quantity -= order.quantity; positions[positionIndex].realizedPnL += realizedDelta; }
  }

  const cash = currentPortfolio.cash + cashDelta;
  let marketValue = 0;
  let unrealized = 0;
  for (const p of positions) {
    const currentValue = p.quantity * marketSnapshot.lastPrice;
    const basis = p.averageEntryPrice * p.quantity;
    const pnl = currentValue - basis;
    p.currentPrice = marketSnapshot.lastPrice; p.marketValue = Math.round(currentValue * 100) / 100;
    p.unrealizedPnL = Math.round(pnl * 100) / 100; p.unrealizedPnLPct = basis > 0 ? Math.round((pnl / basis) * 10000) / 100 : 0;
    marketValue += currentValue; unrealized += pnl;
  }

  const equity = Math.round((cash + marketValue) * 100) / 100;
  const peak = Math.max(currentPortfolio.peakEquity, equity);
  const drawdown = peak > 0 ? Math.round(((peak - equity) / peak) * 10000) / 100 : 0;
  const dailyPnL = equity - currentPortfolio.initialCapital;
  const dailyPnLPct = currentPortfolio.initialCapital > 0 ? Math.round((dailyPnL / currentPortfolio.initialCapital) * 10000) / 100 : 0;
  const exposure = equity > 0 ? Math.round((marketValue / equity) * 1000) / 10 : 0;
  for (const p of positions) p.notionalExposurePct = equity > 0 ? Math.round((p.marketValue / equity) * 1000) / 10 : 0;

  const updatedPortfolio: PortfolioState = {
    cash: Math.round(cash * 100) / 100, initialCapital: currentPortfolio.initialCapital, equity,
    totalUnrealizedPnL: Math.round(unrealized * 100) / 100,
    totalRealizedPnL: Math.round((currentPortfolio.totalRealizedPnL + realizedDelta) * 100) / 100,
    dailyPnL: Math.round(dailyPnL * 100) / 100, dailyPnLPct, peakEquity: peak, currentDrawdownPct: drawdown,
    marginUsed: Math.round(marketValue * 0.25 * 100) / 100, availableMargin: Math.round((cash + marketValue * 0.75) * 100) / 100,
    positionsCount: positions.length, portfolioExposurePct: exposure, positions, lastUpdated: Date.now(),
  };
  return { order, fill, updatedPortfolio, slippageIncurredBps: slippageBps, totalCharges, status: 'FILLED' };
}

function reject(order: OrderRequest, portfolio: PortfolioState, rejectionReason: string): PaperSimulationResult {
  return { order, updatedPortfolio: portfolio, slippageIncurredBps: 0, totalCharges: 0, status: 'REJECTED', rejectionReason };
}
