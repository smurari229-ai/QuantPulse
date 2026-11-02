import { OrderFill, OrderRequest, Position, PortfolioState } from '../types/order';
import { MarketDataSnapshot } from '../types/market';

export interface PaperFillApplicationResult {
  updatedPortfolio: PortfolioState;
  realizedDelta: number;
}

/**
 * Applies one validated paper fill to portfolio accounting.
 * This function is intentionally independent of order sizing so the same
 * accounting path can safely handle full and partial fills.
 */
export function applyPaperFill(
  order: OrderRequest,
  currentPortfolio: PortfolioState,
  marketSnapshot: MarketDataSnapshot,
  fill: OrderFill,
): PaperFillApplicationResult {
  if (fill.orderId !== order.id && fill.orderId !== order.orderId) {
    throw new Error('Fill order ID does not match the submitted order.');
  }
  if (fill.symbol !== order.symbol || fill.side !== order.side) {
    throw new Error('Fill symbol/side does not match the submitted order.');
  }
  if (!Number.isFinite(fill.quantity) || fill.quantity <= 0 || fill.quantity > order.quantity) {
    throw new Error('Fill quantity must be positive and cannot exceed the order quantity.');
  }
  if (!Number.isFinite(fill.price) || fill.price <= 0) throw new Error('Fill price must be positive and finite.');
  if (!Number.isFinite(fill.totalCharges) || fill.totalCharges < 0) throw new Error('Fill charges must be finite and non-negative.');
  if (!Number.isFinite(currentPortfolio.cash) || !Number.isFinite(currentPortfolio.equity) || currentPortfolio.cash < 0 || currentPortfolio.equity <= 0) {
    throw new Error('Current paper portfolio state is invalid.');
  }

  const now = Number.isFinite(fill.timestamp) && fill.timestamp > 0 ? fill.timestamp : Date.now();
  const firstDay = new Date(currentPortfolio.dayStartTimestamp);
  const currentDay = new Date(now);
  const sameTradingDay = Number.isFinite(currentPortfolio.dayStartTimestamp)
    && firstDay.getFullYear() === currentDay.getFullYear()
    && firstDay.getMonth() === currentDay.getMonth()
    && firstDay.getDate() === currentDay.getDate();
  const dayStartEquity = sameTradingDay && Number.isFinite(currentPortfolio.dayStartEquity)
    ? currentPortfolio.dayStartEquity
    : currentPortfolio.equity;
  const dayStartTimestamp = sameTradingDay ? currentPortfolio.dayStartTimestamp : now;

  const positionIndex = currentPortfolio.positions.findIndex((p) => p.symbol === order.symbol);
  const existing = positionIndex >= 0 ? currentPortfolio.positions[positionIndex] : undefined;
  if (order.side === 'SELL' && !existing) throw new Error(`Cannot sell ${order.symbol}: no paper position exists.`);
  if (order.side === 'SELL' && existing && fill.quantity > existing.quantity) {
    throw new Error(`Cannot sell ${fill.quantity} units: only ${existing.quantity} units are held.`);
  }

  const value = fill.price * fill.quantity;
  const positions: Position[] = currentPortfolio.positions.map((p) => ({ ...p }));
  let cashDelta = 0;
  let realizedDelta = 0;

  if (order.side === 'BUY') {
    cashDelta = -(value + fill.totalCharges);
    if (currentPortfolio.cash < value + fill.totalCharges) {
      throw new Error(`Insufficient paper cash: need ${(value + fill.totalCharges).toFixed(2)}.`);
    }
    if (existing) {
      const p = positions[positionIndex];
      const totalQty = p.quantity + fill.quantity;
      p.averageEntryPrice = Math.round(((p.averageEntryPrice * p.quantity + fill.price * fill.quantity) / totalQty) * 100) / 100;
      p.entryCharges = Math.round(((p.entryCharges ?? 0) + fill.totalCharges) * 100) / 100;
      p.quantity = totalQty;
      p.currentPrice = marketSnapshot.lastPrice;
    } else {
      positions.push({
        symbol: order.symbol,
        quantity: fill.quantity,
        averageEntryPrice: fill.price,
        currentPrice: marketSnapshot.lastPrice,
        marketValue: 0,
        unrealizedPnL: 0,
        unrealizedPnLPct: 0,
        realizedPnL: 0,
        entryCharges: fill.totalCharges,
        stopLossPrice: order.stopLossPrice,
        takeProfitPrice: order.takeProfitPrice,
        notionalExposurePct: 0,
        highestPriceSinceEntry: fill.price,
        openedAt: now,
      });
    }
  } else if (existing) {
    cashDelta = value - fill.totalCharges;
    const allocatedEntryCharges = Math.round(((existing.entryCharges ?? 0) * (fill.quantity / existing.quantity)) * 100) / 100;
    realizedDelta = (fill.price - existing.averageEntryPrice) * fill.quantity - allocatedEntryCharges - fill.totalCharges;
    if (fill.quantity === existing.quantity) {
      positions.splice(positionIndex, 1);
    } else {
      const p = positions[positionIndex];
      p.quantity -= fill.quantity;
      p.entryCharges = Math.max(0, Math.round(((existing.entryCharges ?? 0) - allocatedEntryCharges) * 100) / 100);
      p.realizedPnL += realizedDelta;
    }
  }

  const cash = currentPortfolio.cash + cashDelta;
  let marketValue = 0;
  let unrealized = 0;
  for (const p of positions) {
    const currentValue = p.quantity * marketSnapshot.lastPrice;
    const basis = p.averageEntryPrice * p.quantity;
    const pnl = currentValue - basis - (p.entryCharges ?? 0);
    p.currentPrice = marketSnapshot.lastPrice;
    p.marketValue = Math.round(currentValue * 100) / 100;
    p.unrealizedPnL = Math.round(pnl * 100) / 100;
    p.unrealizedPnLPct = basis > 0 ? Math.round((pnl / basis) * 10000) / 100 : 0;
    marketValue += currentValue;
    unrealized += pnl;
  }

  const equity = Math.round((cash + marketValue) * 100) / 100;
  const peak = Math.max(currentPortfolio.peakEquity, equity);
  const drawdown = peak > 0 ? Math.round(((peak - equity) / peak) * 10000) / 100 : 0;
  const dailyPnL = Math.round((equity - dayStartEquity) * 100) / 100;
  const dailyPnLPct = dayStartEquity > 0 ? Math.round((dailyPnL / dayStartEquity) * 10000) / 100 : 0;
  const exposure = equity > 0 ? Math.round((marketValue / equity) * 1000) / 10 : 0;
  for (const p of positions) {
    p.notionalExposurePct = equity > 0 ? Math.round((p.marketValue / equity) * 1000) / 10 : 0;
  }

  return {
    updatedPortfolio: {
      cash: Math.round(cash * 100) / 100,
      initialCapital: currentPortfolio.initialCapital,
      equity,
      totalUnrealizedPnL: Math.round(unrealized * 100) / 100,
      totalRealizedPnL: Math.round((currentPortfolio.totalRealizedPnL + realizedDelta) * 100) / 100,
      dailyPnL,
      dailyPnLPct,
      dayStartEquity,
      dayStartTimestamp,
      peakEquity: peak,
      currentDrawdownPct: drawdown,
      marginUsed: Math.round(marketValue * 0.25 * 100) / 100,
      availableMargin: Math.round((cash + marketValue * 0.75) * 100) / 100,
      positionsCount: positions.length,
      portfolioExposurePct: exposure,
      positions,
      lastUpdated: now,
    },
    realizedDelta,
  };
}
