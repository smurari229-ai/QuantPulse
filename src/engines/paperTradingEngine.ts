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
  cash: 100000,
  initialCapital: 100000,
  equity: 100000,
  totalUnrealizedPnL: 0,
  totalRealizedPnL: 0,
  dailyPnL: 0,
  dailyPnLPct: 0,
  peakEquity: 100000,
  currentDrawdownPct: 0,
  marginUsed: 0,
  availableMargin: 100000,
  positionsCount: 0,
  portfolioExposurePct: 0,
  positions: [],
  lastUpdated: Date.now(),
};

export function executePaperOrder(
  order: OrderRequest,
  currentPortfolio: PortfolioState,
  marketSnapshot: MarketDataSnapshot,
  options?: { simulatedLatencyMs?: number; customSlippageBps?: number }
): PaperSimulationResult {
  // Defensive check: Paper trading only
  if (order.executionMode === 'LIVE_BLOCKED') {
    return {
      order,
      updatedPortfolio: currentPortfolio,
      slippageIncurredBps: 0,
      totalCharges: 0,
      status: 'REJECTED',
      rejectionReason: 'Direct Live Execution is strictly blocked by platform governance.',
    };
  }

  // Calculate simulated slippage based on volume and spread
  const baseSlippageBps = options?.customSlippageBps ?? (order.side === 'BUY' ? 4.5 : 5.0);
  const slippageMultiplier = 1 + baseSlippageBps / 10000;
  
  const rawPrice = order.estimatedPrice || (order.side === 'BUY' ? marketSnapshot.ask : marketSnapshot.bid);
  const fillPrice = order.side === 'BUY'
    ? Math.round(rawPrice * slippageMultiplier * 100) / 100
    : Math.round((rawPrice / slippageMultiplier) * 100) / 100;

  const orderValue = fillPrice * order.quantity;

  // Fee calculation (Brokerage: 0.03%, STT/Exchange: 0.012%)
  const brokerFee = Math.max(20, Math.round(orderValue * 0.0003 * 100) / 100);
  const exchangeFee = Math.round(orderValue * 0.000035 * 100) / 100;
  const taxesApplicable = Math.round(orderValue * 0.0001 * 100) / 100; // Securities Transaction Tax
  const totalCharges = brokerFee + exchangeFee + taxesApplicable;

  // Margin / Cash check
  if (order.side === 'BUY' && currentPortfolio.cash < orderValue + totalCharges) {
    return {
      order,
      updatedPortfolio: currentPortfolio,
      slippageIncurredBps: 0,
      totalCharges: 0,
      status: 'REJECTED',
      rejectionReason: `Insufficient paper cash ($${currentPortfolio.cash.toFixed(2)} available, need $${(orderValue + totalCharges).toFixed(2)})`,
    };
  }

  const fill: OrderFill = {
    fillId: `FILL-PAPER-${Date.now().toString(36).toUpperCase()}`,
    orderId: order.id,
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    price: fillPrice,
    slippageIncurredBps: baseSlippageBps,
    brokerFee,
    exchangeFee,
    taxesApplicable,
    totalCharges,
    timestamp: Date.now(),
    brokerOrderId: `MOCK-BRK-${Math.floor(Math.random() * 899999 + 100000)}`,
  };

  // Update positions and portfolio
  const existingPositionIndex = currentPortfolio.positions.findIndex((p) => p.symbol === order.symbol);
  const newPositions = [...currentPortfolio.positions];
  let realizedPnLDelta = 0;
  let cashDelta = 0;

  if (order.side === 'BUY') {
    cashDelta = -(orderValue + totalCharges);
    if (existingPositionIndex >= 0) {
      const existing = newPositions[existingPositionIndex];
      const totalQty = existing.quantity + order.quantity;
      const avgPrice = (existing.averageEntryPrice * existing.quantity + fillPrice * order.quantity) / totalQty;
      newPositions[existingPositionIndex] = {
        ...existing,
        quantity: totalQty,
        averageEntryPrice: Math.round(avgPrice * 100) / 100,
        currentPrice: marketSnapshot.lastPrice,
        marketValue: totalQty * marketSnapshot.lastPrice,
        stopLossPrice: order.stopLossPrice,
        takeProfitPrice: order.takeProfitPrice,
        notionalExposurePct: 0, // recalculated below
      };
    } else {
      newPositions.push({
        symbol: order.symbol,
        quantity: order.quantity,
        averageEntryPrice: fillPrice,
        currentPrice: marketSnapshot.lastPrice,
        marketValue: orderValue,
        unrealizedPnL: 0,
        unrealizedPnLPct: 0,
        realizedPnL: 0,
        stopLossPrice: order.stopLossPrice,
        takeProfitPrice: order.takeProfitPrice,
        notionalExposurePct: 0,
        highestPriceSinceEntry: fillPrice,
        openedAt: Date.now(),
      });
    }
  } else {
    // SELL order
    cashDelta = orderValue - totalCharges;
    if (existingPositionIndex >= 0) {
      const existing = newPositions[existingPositionIndex];
      const closedQty = Math.min(existing.quantity, order.quantity);
      realizedPnLDelta = (fillPrice - existing.averageEntryPrice) * closedQty - totalCharges;

      if (existing.quantity <= order.quantity) {
        // Fully closed
        newPositions.splice(existingPositionIndex, 1);
      } else {
        // Partially closed
        const remainingQty = existing.quantity - order.quantity;
        newPositions[existingPositionIndex] = {
          ...existing,
          quantity: remainingQty,
          realizedPnL: existing.realizedPnL + realizedPnLDelta,
          marketValue: remainingQty * marketSnapshot.lastPrice,
        };
      }
    }
  }

  const newCash = currentPortfolio.cash + cashDelta;
  let totalMarketValue = 0;
  let totalUnrealized = 0;

  for (let i = 0; i < newPositions.length; i++) {
    const p = newPositions[i];
    const curVal = p.quantity * marketSnapshot.lastPrice;
    const unPnL = curVal - p.averageEntryPrice * p.quantity;
    p.marketValue = Math.round(curVal * 100) / 100;
    p.unrealizedPnL = Math.round(unPnL * 100) / 100;
    p.unrealizedPnLPct = Math.round((unPnL / (p.averageEntryPrice * p.quantity)) * 10000) / 100;
    totalMarketValue += curVal;
    totalUnrealized += unPnL;
  }

  const newEquity = Math.round((newCash + totalMarketValue) * 100) / 100;
  const newPeak = Math.max(currentPortfolio.peakEquity, newEquity);
  const drawdownPct = newPeak > 0 ? Math.round(((newPeak - newEquity) / newPeak) * 10000) / 100 : 0;
  const totalRealized = currentPortfolio.totalRealizedPnL + realizedPnLDelta;
  const dailyPnL = newEquity - currentPortfolio.initialCapital;
  const dailyPnLPct = Math.round((dailyPnL / currentPortfolio.initialCapital) * 10000) / 100;
  const portfolioExposurePct = newEquity > 0 ? Math.round((totalMarketValue / newEquity) * 1000) / 10 : 0;

  // Recalculate each position's exposure %
  for (const p of newPositions) {
    p.notionalExposurePct = newEquity > 0 ? Math.round((p.marketValue / newEquity) * 1000) / 10 : 0;
  }

  const updatedPortfolio: PortfolioState = {
    cash: Math.round(newCash * 100) / 100,
    initialCapital: currentPortfolio.initialCapital,
    equity: newEquity,
    totalUnrealizedPnL: Math.round(totalUnrealized * 100) / 100,
    totalRealizedPnL: Math.round(totalRealized * 100) / 100,
    dailyPnL: Math.round(dailyPnL * 100) / 100,
    dailyPnLPct,
    peakEquity: newPeak,
    currentDrawdownPct: drawdownPct,
    marginUsed: Math.round(totalMarketValue * 0.25 * 100) / 100,
    availableMargin: Math.round((newCash + totalMarketValue * 0.75) * 100) / 100,
    positionsCount: newPositions.length,
    portfolioExposurePct,
    positions: newPositions,
    lastUpdated: Date.now(),
  };

  return {
    order,
    fill,
    updatedPortfolio,
    slippageIncurredBps: baseSlippageBps,
    totalCharges,
    status: 'FILLED',
  };
}
