import { OrderRequest, OrderFill, Position, PortfolioState } from '../types/order';
import { MarketDataSnapshot } from '../types/market';
import { evaluateRiskGates, DEFAULT_RISK_CONFIG, RecentOrderContext } from './riskEngine';
import { RiskEngineConfig } from '../types/risk';
import { applyPaperFill } from './paperFillEngine';

export interface PaperSimulationResult {
  order: OrderRequest;
  fill?: OrderFill;
  updatedPortfolio: PortfolioState;
  slippageIncurredBps: number;
  totalCharges: number;
  status: 'FILLED' | 'REJECTED';
  rejectionReason?: string;
}

const INITIAL_NOW = Date.now();

export const INITIAL_PORTFOLIO_STATE: PortfolioState = {
  cash: 100000, initialCapital: 100000, equity: 100000, totalUnrealizedPnL: 0, totalRealizedPnL: 0,
  dailyPnL: 0, dailyPnLPct: 0, dayStartEquity: 100000, dayStartTimestamp: INITIAL_NOW, peakEquity: 100000, currentDrawdownPct: 0, marginUsed: 0,
  availableMargin: 100000, positionsCount: 0, portfolioExposurePct: 0, positions: [], lastUpdated: INITIAL_NOW,
};

function isSameLocalCalendarDay(a: number, b: number): boolean {
  const first = new Date(a);
  const second = new Date(b);
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function secureBrokerOrderId(): string {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return `MOCK-BRK-${(values[0] % 900000 + 100000).toString()}`;
}

export function executePaperOrder(order: OrderRequest, currentPortfolio: PortfolioState, marketSnapshot: MarketDataSnapshot, options?: { simulatedLatencyMs?: number; customSlippageBps?: number; isExecutionHalted?: boolean; riskConfig?: RiskEngineConfig; riskContext?: Partial<RecentOrderContext> }): PaperSimulationResult {
  if (options?.isExecutionHalted) return reject(order, currentPortfolio, 'Paper execution is halted by the active kill switch.');
  if (order.executionMode !== 'PAPER') return reject(order, currentPortfolio, 'Paper simulator accepts PAPER execution mode only; live/offline routing is blocked.');
  if (order.side !== 'BUY' && order.side !== 'SELL') return reject(order, currentPortfolio, 'Order side must be BUY or SELL.');
  if (order.type !== 'MARKET' && order.type !== 'LIMIT') return reject(order, currentPortfolio, `Unsupported order type: ${order.type}.`);
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) return reject(order, currentPortfolio, 'Order quantity must be a positive finite number.');
  if (typeof order.symbol !== 'string' || order.symbol.trim().length === 0) return reject(order, currentPortfolio, 'Order symbol is required.');
  if (order.symbol !== marketSnapshot.symbol) return reject(order, currentPortfolio, 'Order symbol does not match the supplied market snapshot.');
  if (!Number.isFinite(order.timestamp) || order.timestamp <= 0) return reject(order, currentPortfolio, 'Order timestamp must be a positive finite number.');
  if (marketSnapshot.dataQuality.isValidated !== true || marketSnapshot.dataQuality.isStale) return reject(order, currentPortfolio, 'Market snapshot is not validated or is stale.');
  if (!Number.isFinite(marketSnapshot.lastPrice) || marketSnapshot.lastPrice <= 0 || !Number.isFinite(marketSnapshot.bid) || marketSnapshot.bid <= 0 || !Number.isFinite(marketSnapshot.ask) || marketSnapshot.ask <= 0 || marketSnapshot.ask < marketSnapshot.bid) return reject(order, currentPortfolio, 'Invalid market bid/ask/last-price data.');
  const riskVerdict = evaluateRiskGates(order, currentPortfolio, marketSnapshot, options?.riskContext, options?.riskConfig ?? DEFAULT_RISK_CONFIG);
  if (!riskVerdict.isApproved) return reject(order, currentPortfolio, `Paper order rejected by deterministic risk engine: ${riskVerdict.rejectionReasons.join(' | ')}`);
  if (!Number.isFinite(currentPortfolio.cash) || !Number.isFinite(currentPortfolio.equity) || currentPortfolio.cash < 0 || currentPortfolio.equity <= 0) return reject(order, currentPortfolio, 'Current paper portfolio state is invalid.');
  const now = Date.now();
  const sameTradingDay = Number.isFinite(currentPortfolio.dayStartTimestamp) && isSameLocalCalendarDay(currentPortfolio.dayStartTimestamp, now);
  const dayStartEquity = sameTradingDay && Number.isFinite(currentPortfolio.dayStartEquity) ? currentPortfolio.dayStartEquity : currentPortfolio.equity;
  const dayStartTimestamp = sameTradingDay ? currentPortfolio.dayStartTimestamp : now;

  const positionIndex = currentPortfolio.positions.findIndex(p => p.symbol === order.symbol);
  const existing = positionIndex >= 0 ? currentPortfolio.positions[positionIndex] : undefined;
  if (order.side === 'SELL' && !existing) return reject(order, currentPortfolio, `Cannot sell ${order.symbol}: no paper position exists.`);
  if (order.side === 'SELL' && existing && order.quantity > existing.quantity) return reject(order, currentPortfolio, `Cannot sell ${order.quantity} units: only ${existing.quantity} units are held.`);

  const slippageBps = options?.customSlippageBps ?? (order.side === 'BUY' ? 4.5 : 5);
  if (!Number.isFinite(slippageBps) || slippageBps < 0) return reject(order, currentPortfolio, 'Slippage configuration must be a finite non-negative number.');
  const factor = 1 + slippageBps / 10000;

  let rawPrice: number;
  let limitPrice: number | undefined;
  if (order.type === 'LIMIT') {
    limitPrice = order.limitPrice;
    if (!Number.isFinite(limitPrice) || limitPrice <= 0) return reject(order, currentPortfolio, 'Limit order requires a positive finite limit price.');
    const marketable = order.side === 'BUY' ? marketSnapshot.ask <= limitPrice : marketSnapshot.bid >= limitPrice;
    if (!marketable) return reject(order, currentPortfolio, `Limit order is not marketable at current quote (bid $${marketSnapshot.bid.toFixed(2)}, ask $${marketSnapshot.ask.toFixed(2)}, limit $${limitPrice.toFixed(2)}). Pending limit orders are not supported by this paper simulator.`);
    rawPrice = order.side === 'BUY' ? marketSnapshot.ask : marketSnapshot.bid;
  } else {
    rawPrice = order.estimatedPrice ?? (order.side === 'BUY' ? marketSnapshot.ask : marketSnapshot.bid);
  }

  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return reject(order, currentPortfolio, 'Invalid execution price.');
  const fillPrice = order.side === 'BUY' ? Math.round(rawPrice * factor * 100) / 100 : Math.round((rawPrice / factor) * 100) / 100;
  if (limitPrice !== undefined) {
    const violatesLimit = order.side === 'BUY' ? fillPrice > limitPrice : fillPrice < limitPrice;
    if (violatesLimit) return reject(order, currentPortfolio, `Limit order cancelled: modeled slippage would breach the ${order.side === 'BUY' ? 'maximum buy' : 'minimum sell'} price of $${limitPrice.toFixed(2)}.`);
  }
  const value = fillPrice * order.quantity;
  const brokerFee = Math.max(20, Math.round(value * 0.0003 * 100) / 100);
  const exchangeFee = Math.round(value * 0.000035 * 100) / 100;
  const taxesApplicable = Math.round(value * 0.0001 * 100) / 100;
  const totalCharges = Math.round((brokerFee + exchangeFee + taxesApplicable) * 100) / 100;

  if (order.side === 'BUY' && currentPortfolio.cash < value + totalCharges) return reject(order, currentPortfolio, `Insufficient paper cash ($${currentPortfolio.cash.toFixed(2)} available, need $${(value + totalCharges).toFixed(2)}).`);

  const fill: OrderFill = {
    fillId: `FILL-PAPER-${now.toString(36).toUpperCase()}`, orderId: order.id, symbol: order.symbol, side: order.side,
    quantity: order.quantity, price: fillPrice, slippageIncurredBps: slippageBps, slippageBps, brokerFee, brokerageFee: brokerFee,
    exchangeFee, taxesApplicable, totalCharges, timestamp: now, brokerOrderId: secureBrokerOrderId(),
  };

  const accounting = applyPaperFill(order, currentPortfolio, marketSnapshot, fill);
  return {
    order,
    fill,
    updatedPortfolio: accounting.updatedPortfolio,
    slippageIncurredBps: slippageBps,
    totalCharges,
    status: 'FILLED',
  };
}

function reject(order: OrderRequest, portfolio: PortfolioState, rejectionReason: string): PaperSimulationResult {
  return { order, updatedPortfolio: portfolio, slippageIncurredBps: 0, totalCharges: 0, status: 'REJECTED', rejectionReason };
}
