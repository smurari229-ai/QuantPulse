import {
  RiskEngineConfig,
  RiskValidationVerdict,
  IndividualRiskCheckResult,
} from '../types/risk';
import { OrderRequest, PortfolioState } from '../types/order';
import { MarketDataSnapshot } from '../types/market';

export const DEFAULT_RISK_CONFIG: RiskEngineConfig = {
  maxPositionSizeNotional: 25000,
  maxPositionPctOfPortfolio: 25,
  maxPortfolioExposurePct: 70,
  maxDailyLossPct: 3.0,
  maxDrawdownHaltPct: 8.0,
  maxTradesPerDay: 20,
  minOrderIntervalSeconds: 30,
  minRiskRewardRatio: 1.5,
  maxEstimatedSlippageBps: 25,
  maxDataStalenessMs: 3000,
  requireStopLoss: true,
  requireTakeProfit: true,
  maxSpreadBps: 20,
  enforceDuplicateWindowSeconds: 60,
};

export interface RecentOrderContext {
  lastOrderTimestamps: Record<string, number>;
  recentOrders: { id: string; symbol: string; side: string; quantity: number; timestamp: number }[];
  todayExecutedTradesCount: number;
  brokerHeartbeatActive: boolean;
  isEmergencyKillSwitchActive: boolean;
}

export const DEFAULT_RECENT_CONTEXT: RecentOrderContext = {
  lastOrderTimestamps: {},
  recentOrders: [],
  todayExecutedTradesCount: 0,
  brokerHeartbeatActive: true,
  isEmergencyKillSwitchActive: false,
};

function secureRandomDigits(min: number, max: number): number {
  const range = max - min + 1;
  if (!Number.isInteger(min) || !Number.isInteger(max) || range <= 0) {
    throw new Error('Invalid secure random range.');
  }
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return min + (values[0] % range);
}

function isSameLocalCalendarDay(a: number, b: number): boolean {
  const first = new Date(a);
  const second = new Date(b);
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function getEffectiveDailyPnLPct(portfolio: PortfolioState, now: number): number {
  if (!Number.isFinite(portfolio.dayStartTimestamp) || !isSameLocalCalendarDay(portfolio.dayStartTimestamp, now)) return 0;
  if (!Number.isFinite(portfolio.dayStartEquity) || portfolio.dayStartEquity <= 0) return 0;
  return ((portfolio.equity - portfolio.dayStartEquity) / portfolio.dayStartEquity) * 100;
}

export function evaluateRiskGates(
  order: OrderRequest,
  portfolio: PortfolioState,
  marketSnapshot: MarketDataSnapshot,
  ctx?: Partial<RecentOrderContext>,
  config: RiskEngineConfig = DEFAULT_RISK_CONFIG
): RiskValidationVerdict {
  const context: RecentOrderContext = { ...DEFAULT_RECENT_CONTEXT, ...ctx };
  const checks: IndividualRiskCheckResult[] = [];
  const rejectionReasons: string[] = [];

  // Risk configuration is a safety boundary. Reject malformed runtime configs
  // instead of allowing a caller to accidentally weaken a gate with invalid values.
  const numericConfigValues = [
    config.maxPositionSizeNotional, config.maxPositionPctOfPortfolio,
    config.maxPortfolioExposurePct, config.maxDailyLossPct, config.maxDrawdownHaltPct,
    config.maxTradesPerDay, config.minOrderIntervalSeconds, config.minRiskRewardRatio,
    config.maxEstimatedSlippageBps, config.maxDataStalenessMs, config.maxSpreadBps,
    config.enforceDuplicateWindowSeconds,
  ];
  const validConfig = numericConfigValues.every(Number.isFinite)
    && config.maxPositionSizeNotional > 0
    && config.maxPositionPctOfPortfolio > 0 && config.maxPositionPctOfPortfolio <= 100
    && config.maxPortfolioExposurePct > 0 && config.maxPortfolioExposurePct <= 100
    && config.maxDailyLossPct > 0 && config.maxDailyLossPct <= 100
    && config.maxDrawdownHaltPct > 0 && config.maxDrawdownHaltPct <= 100
    && config.maxTradesPerDay > 0 && config.minOrderIntervalSeconds >= 0
    && config.minRiskRewardRatio > 0 && config.maxEstimatedSlippageBps >= 0
    && config.maxDataStalenessMs > 0 && config.maxSpreadBps > 0
    && config.enforceDuplicateWindowSeconds >= 0;
  if (!validConfig) {
    const invalidConfigCheck: IndividualRiskCheckResult = {
      checkName: 'RISK_CONFIGURATION_SANITY', passed: false, severity: 'CRITICAL_REJECT',
      currentValue: 'INVALID_RISK_CONFIG', thresholdLimit: 'VALID_FINITE_RISK_CONFIG',
      reason: 'Risk evaluation rejected because the supplied risk configuration is invalid or non-finite.',
    };
    checks.push(invalidConfigCheck);
    rejectionReasons.push('Invalid or non-finite risk configuration.');
    const passedChecksCount = 0;
    const auditableRiskToken = `RISK-VERDICT-${Date.now().toString(36).toUpperCase()}-REJT-${secureRandomDigits(1000, 9999)}`;
    return { isApproved: false, timestamp: Date.now(), orderIdProposed: order.id || order.orderId || 'PROPOSED-ORDER', symbol: order.symbol, totalChecksCount: 1, passedChecksCount, failedChecksCount: 1, checks: [{ ...invalidConfigCheck, gateId: invalidConfigCheck.checkName, gateName: 'RISK CONFIGURATION SANITY', status: 'FAILED', threshold: invalidConfigCheck.thresholdLimit, message: invalidConfigCheck.reason }], rejectionReasons, auditableRiskToken };
  }

  const referencePrice = order.estimatedPrice
    ?? (order.type === 'LIMIT' ? order.limitPrice ?? Number.NaN : order.side === 'BUY' ? marketSnapshot.ask : marketSnapshot.bid);
  const validOrderSide = order.side === 'BUY' || order.side === 'SELL';
  const validOrderType = order.type === 'MARKET' || order.type === 'LIMIT';
  const validSymbol = typeof order.symbol === 'string' && order.symbol.trim().length > 0 && order.symbol === marketSnapshot.symbol;
  const validPortfolioState = Number.isFinite(portfolio.cash) && portfolio.cash >= 0
    && Number.isFinite(portfolio.equity) && portfolio.equity > 0
    && Number.isFinite(portfolio.dayStartEquity) && portfolio.dayStartEquity > 0
    && Number.isFinite(portfolio.dayStartTimestamp) && portfolio.dayStartTimestamp > 0
    && Number.isFinite(portfolio.currentDrawdownPct) && portfolio.currentDrawdownPct >= 0
    && Array.isArray(portfolio.positions)
    && portfolio.positions.every((position) =>
      typeof position.symbol === 'string'
      && position.symbol.trim().length > 0
      && Number.isFinite(position.quantity) && position.quantity >= 0
      && Number.isFinite(position.marketValue) && position.marketValue >= 0
    );
  const orderNotional = order.quantity * referencePrice;
  const existingPosition = portfolio.positions.find((position) => position.symbol === order.symbol);
  const existingPositionNotional = existingPosition?.marketValue ?? 0;
  const projectedPositionNotional = order.side === 'SELL'
    ? Math.max(0, existingPositionNotional - orderNotional)
    : existingPositionNotional + orderNotional;
  const positionPct = portfolio.equity > 0 ? (projectedPositionNotional / portfolio.equity) * 100 : 100;
  const currentInvested = portfolio.positions.reduce((sum, p) => sum + p.marketValue, 0);
  const exposureDelta = order.side === 'SELL' ? -Math.min(orderNotional, existingPositionNotional) : orderNotional;
  const projectedInvested = Math.max(0, currentInvested + exposureDelta);
  const projectedExposurePct = portfolio.equity > 0 ? (projectedInvested / portfolio.equity) * 100 : 100;

  const validQuantity = Number.isFinite(order.quantity) && order.quantity > 0;
  const validReferencePrice = Number.isFinite(referencePrice) && referencePrice > 0;
  const validMarketPrices = marketSnapshot.symbol === order.symbol
    && marketSnapshot.dataQuality.isValidated === true
    && Number.isFinite(marketSnapshot.lastPrice) && marketSnapshot.lastPrice > 0
    && Number.isFinite(marketSnapshot.bid) && Number.isFinite(marketSnapshot.ask)
    && marketSnapshot.bid > 0 && marketSnapshot.ask >= marketSnapshot.bid;
  const passedSanity = validQuantity && validReferencePrice && validMarketPrices && validOrderSide && validOrderType && validSymbol && validPortfolioState;
  checks.push({ checkName: 'ORDER_MARKET_SANITY', passed: passedSanity, severity: 'CRITICAL_REJECT', currentValue: passedSanity ? 'VALID' : 'INVALID_INPUT', thresholdLimit: 'Positive finite quantity/price and valid bid/ask', reason: passedSanity ? 'Order quantity, side/type, symbol, market pricing, and portfolio inputs are valid.' : 'Order rejected: malformed quantity, side/type, symbol, reference price, bid/ask, or portfolio state.' });
  if (!passedSanity) rejectionReasons.push('Malformed order or market pricing input.');

  const passedKillSwitch = !context.isEmergencyKillSwitchActive;
  checks.push({ checkName: 'MARKET_ABNORMALITY_CIRCUIT_BREAKER', passed: passedKillSwitch, severity: 'CRITICAL_REJECT', currentValue: context.isEmergencyKillSwitchActive ? 'ACTIVE_HALTED' : 'NORMAL', thresholdLimit: 'NORMAL', reason: passedKillSwitch ? 'Emergency kill switch is disengaged.' : 'CRITICAL: Emergency Kill Switch is engaged. All trading is strictly halted.' });
  if (!passedKillSwitch) rejectionReasons.push('Emergency Kill Switch is currently engaged.');

  const passedMaxNotional = projectedPositionNotional <= config.maxPositionSizeNotional;
  checks.push({ checkName: 'MAX_POSITION_NOTIONAL', passed: passedMaxNotional, severity: 'CRITICAL_REJECT', currentValue: `$${Math.round(notional).toLocaleString()}`, thresholdLimit: `$${config.maxPositionSizeNotional.toLocaleString()}`, reason: passedMaxNotional ? 'Projected position notional is within the individual position limit.' : `Projected position notional (${Math.round(projectedPositionNotional).toLocaleString()}) exceeds maximum permitted (${config.maxPositionSizeNotional.toLocaleString()}).` });
  if (!passedMaxNotional) rejectionReasons.push(`Position size exceeds $${config.maxPositionSizeNotional.toLocaleString()}`);

  const passedMaxPositionPct = positionPct <= config.maxPositionPctOfPortfolio;
  checks.push({ checkName: 'MAX_POSITION_PCT_OF_PORTFOLIO', passed: passedMaxPositionPct, severity: 'CRITICAL_REJECT', currentValue: `${positionPct.toFixed(1)}%`, thresholdLimit: `${config.maxPositionPctOfPortfolio}%`, reason: passedMaxPositionPct ? 'Position concentration is within risk bounds.' : `Position would represent ${positionPct.toFixed(1)}% of portfolio (limit: ${config.maxPositionPctOfPortfolio}%).` });
  if (!passedMaxPositionPct) rejectionReasons.push(`Position concentration exceeds ${config.maxPositionPctOfPortfolio}%`);

  const passedExposure = projectedExposurePct <= config.maxPortfolioExposurePct;
  checks.push({ checkName: 'MAX_PORTFOLIO_EXPOSURE', passed: passedExposure, severity: 'CRITICAL_REJECT', currentValue: `${projectedExposurePct.toFixed(1)}%`, thresholdLimit: `${config.maxPortfolioExposurePct}%`, reason: passedExposure ? 'Projected total portfolio exposure is within safe limits.' : `Projected portfolio exposure (${projectedExposurePct.toFixed(1)}%) breaches ceiling of ${config.maxPortfolioExposurePct}%.` });
  if (!passedExposure) rejectionReasons.push(`Portfolio exposure would exceed ${config.maxPortfolioExposurePct}%`);

  const now = Date.now();
  const effectiveDailyPnLPct = getEffectiveDailyPnLPct(portfolio, now);
  const passedDailyLoss = effectiveDailyPnLPct > -config.maxDailyLossPct;
  checks.push({ checkName: 'MAX_DAILY_LOSS', passed: passedDailyLoss, severity: 'CRITICAL_REJECT', currentValue: `${effectiveDailyPnLPct.toFixed(2)}%`, thresholdLimit: `-${config.maxDailyLossPct.toFixed(2)}%`, reason: passedDailyLoss ? 'Daily P&L is above daily loss circuit breaker.' : `Daily loss (${effectiveDailyPnLPct.toFixed(2)}%) hit circuit breaker limit of -${config.maxDailyLossPct}%. Trading halted for the session.` });
  if (!passedDailyLoss) rejectionReasons.push('Daily loss circuit breaker triggered.');

  const passedDrawdown = portfolio.currentDrawdownPct < config.maxDrawdownHaltPct;
  checks.push({ checkName: 'MAX_PORTFOLIO_DRAWDOWN', passed: passedDrawdown, severity: 'CRITICAL_REJECT', currentValue: `${portfolio.currentDrawdownPct.toFixed(2)}%`, thresholdLimit: `< ${config.maxDrawdownHaltPct.toFixed(2)}%`, reason: passedDrawdown ? 'Current drawdown is within tolerable parameters.' : `Portfolio drawdown (${portfolio.currentDrawdownPct.toFixed(2)}%) reaches/exceeds max allowed (${config.maxDrawdownHaltPct}%). Risk mitigation required.` });
  if (!passedDrawdown) rejectionReasons.push('Portfolio drawdown threshold breached.');

  const passedMaxTrades = context.todayExecutedTradesCount < config.maxTradesPerDay;
  checks.push({ checkName: 'MAX_TRADES_PER_DAY', passed: passedMaxTrades, severity: 'CRITICAL_REJECT', currentValue: context.todayExecutedTradesCount, thresholdLimit: `< ${config.maxTradesPerDay}`, reason: passedMaxTrades ? 'Daily trade frequency is within limit.' : `Daily trade count (${context.todayExecutedTradesCount}) reached quota (${config.maxTradesPerDay}).` });
  if (!passedMaxTrades) rejectionReasons.push('Daily trade count quota reached.');

  const lastTime = context.lastOrderTimestamps[order.symbol] || 0;
  const timeSinceLastOrderSec = (now - lastTime) / 1000;
  const passedFrequency = timeSinceLastOrderSec >= config.minOrderIntervalSeconds;
  checks.push({ checkName: 'ORDER_FREQUENCY_THROTTLE', passed: passedFrequency, severity: 'CRITICAL_REJECT', currentValue: `${timeSinceLastOrderSec.toFixed(1)}s elapsed`, thresholdLimit: `>= ${config.minOrderIntervalSeconds}s interval`, reason: passedFrequency ? 'Order frequency cooldown satisfied.' : timeSinceLastOrderSec < 0 ? 'Order rejected: last-order timestamp is in the future.' : `Order throttling active on ${order.symbol}. Last order was ${timeSinceLastOrderSec.toFixed(1)}s ago (min: ${config.minOrderIntervalSeconds}s).` });
  if (!passedFrequency) rejectionReasons.push(timeSinceLastOrderSec < 0 ? 'Invalid future order timestamp in risk context.' : `Order throttle active. Wait ${Math.ceil(config.minOrderIntervalSeconds - timeSinceLastOrderSec)}s.`);

  const hasStopLoss = typeof order.stopLossPrice === 'number' && order.stopLossPrice > 0;
  let validStopLoss = hasStopLoss;
  if (hasStopLoss) {
    if (order.side === 'BUY') validStopLoss = order.stopLossPrice < referencePrice;
    if (order.side === 'SELL') validStopLoss = order.stopLossPrice > referencePrice;
  }
  checks.push({ checkName: 'MANDATORY_STOP_LOSS', passed: validStopLoss, severity: 'CRITICAL_REJECT', currentValue: order.stopLossPrice || 0, thresholdLimit: 'Strictly Required & directional', reason: validStopLoss ? `Stop loss set at ${order.stopLossPrice}.` : 'Order rejected: Mandatory stop-loss price missing or on incorrect side of entry.' });
  if (!validStopLoss) rejectionReasons.push('Mandatory Stop-Loss missing or invalid.');

  const hasTakeProfit = typeof order.takeProfitPrice === 'number' && order.takeProfitPrice > 0;
  let validTakeProfit = hasTakeProfit;
  if (hasTakeProfit) {
    if (order.side === 'BUY') validTakeProfit = order.takeProfitPrice > referencePrice;
    if (order.side === 'SELL') validTakeProfit = order.takeProfitPrice < referencePrice;
  }
  checks.push({ checkName: 'MANDATORY_TAKE_PROFIT', passed: validTakeProfit, severity: 'CRITICAL_REJECT', currentValue: order.takeProfitPrice || 0, thresholdLimit: 'Strictly Required & directional', reason: validTakeProfit ? `Take profit set at ${order.takeProfitPrice}.` : 'Order rejected: Mandatory take-profit price missing or on incorrect side of entry.' });
  if (!validTakeProfit) rejectionReasons.push('Mandatory Take-Profit missing or invalid.');

  const riskUnit = Math.abs(referencePrice - (order.stopLossPrice || referencePrice));
  const rewardUnit = Math.abs((order.takeProfitPrice || referencePrice) - referencePrice);
  const actualRR = riskUnit > 0 ? rewardUnit / riskUnit : 0;
  const passedRR = actualRR >= config.minRiskRewardRatio;
  checks.push({ checkName: 'RISK_REWARD_RATIO', passed: passedRR, severity: 'CRITICAL_REJECT', currentValue: `${actualRR.toFixed(2)}:1`, thresholdLimit: `>= ${config.minRiskRewardRatio}:1`, reason: passedRR ? `Risk/reward ratio ${actualRR.toFixed(2)}:1 passes minimum hurdle.` : `Risk/reward ratio (${actualRR.toFixed(2)}:1) fails minimum hurdle of ${config.minRiskRewardRatio}:1.` });
  if (!passedRR) rejectionReasons.push(`Risk/reward ${actualRR.toFixed(2)}:1 below required ${config.minRiskRewardRatio}:1.`);

  const spreadBps = validMarketPrices ? ((marketSnapshot.ask - marketSnapshot.bid) / marketSnapshot.bid) * 10000 : Number.POSITIVE_INFINITY;
  const passedSpread = Number.isFinite(spreadBps) && spreadBps <= config.maxSpreadBps;
  checks.push({ checkName: 'LIQUIDITY_SPREAD_CHECK', passed: passedSpread, severity: 'CRITICAL_REJECT', currentValue: Number.isFinite(spreadBps) ? `${spreadBps.toFixed(1)} bps` : 'INVALID', thresholdLimit: `<= ${config.maxSpreadBps} bps`, reason: passedSpread ? `Spread is liquid at ${spreadBps.toFixed(1)} bps.` : 'Spread/quote data is invalid or exceeds the configured liquidity ceiling.' });
  if (!passedSpread) rejectionReasons.push('Invalid or excessive bid/ask spread.');

  const estSlippage = order.estimatedSlippageBps ?? 5;
  const passedSlippage = Number.isFinite(estSlippage) && estSlippage >= 0 && estSlippage <= config.maxEstimatedSlippageBps;
  checks.push({ checkName: 'SLIPPAGE_TOLERANCE', passed: passedSlippage, severity: 'CRITICAL_REJECT', currentValue: `${estSlippage} bps`, thresholdLimit: `0 <= bps <= ${config.maxEstimatedSlippageBps}`, reason: passedSlippage ? 'Estimated market impact slippage is within bounds.' : `Estimated slippage (${estSlippage} bps) is invalid or exceeds ceiling (${config.maxEstimatedSlippageBps} bps).` });
  if (!passedSlippage) rejectionReasons.push('Invalid or excessive slippage risk.');

  const duplicateWindowMs = config.enforceDuplicateWindowSeconds * 1000;
  const isDuplicate = context.recentOrders.some((o) => {
    const ageMs = now - o.timestamp;
    return o.symbol === order.symbol && o.side === order.side && Math.abs(o.quantity - order.quantity) < 0.001 && ageMs >= 0 && ageMs < duplicateWindowMs;
  });
  checks.push({ checkName: 'DUPLICATE_ORDER_DETECTION', passed: !isDuplicate, severity: 'CRITICAL_REJECT', currentValue: isDuplicate ? 'DUPLICATE_IDENTIFIED' : 'UNIQUE', thresholdLimit: 'UNIQUE', reason: !isDuplicate ? 'No duplicate order detected within time window.' : `Duplicate order detected for ${order.symbol} (${order.side} ${order.quantity}) within ${config.enforceDuplicateWindowSeconds}s window.` });
  if (isDuplicate) rejectionReasons.push('Duplicate order detected within time window.');

  const dataAgeMs = now - marketSnapshot.timestamp;
  const passedDataFreshness = Number.isFinite(dataAgeMs) && dataAgeMs >= 0 && dataAgeMs <= config.maxDataStalenessMs && !marketSnapshot.dataQuality.isStale;
  checks.push({ checkName: 'STALE_DATA_GUARD', passed: passedDataFreshness, severity: 'CRITICAL_REJECT', currentValue: `${dataAgeMs} ms age`, thresholdLimit: `0 <= age <= ${config.maxDataStalenessMs} ms`, reason: passedDataFreshness ? `Market data is fresh (${dataAgeMs}ms latency).` : `Market data is STALE/invalid (${dataAgeMs}ms > max ${config.maxDataStalenessMs}ms). Cannot price order safely.` });
  if (!passedDataFreshness) rejectionReasons.push(`Stale or invalid market data feed (${dataAgeMs}ms age).`);

  const passedHeartbeat = context.brokerHeartbeatActive;
  checks.push({ checkName: 'BROKER_CONNECTIVITY_HEARTBEAT', passed: passedHeartbeat, severity: 'CRITICAL_REJECT', currentValue: passedHeartbeat ? 'HEARTBEAT_ACK' : 'DISCONNECTED', thresholdLimit: 'HEARTBEAT_ACK', reason: passedHeartbeat ? 'Broker gateway heartbeat confirmed.' : 'Broker connection is down or heartbeat timed out. Routing disabled.' });
  if (!passedHeartbeat) rejectionReasons.push('Broker gateway disconnected.');

  const passedChecksCount = checks.filter((c) => c.passed).length;
  const failedChecksCount = checks.length - passedChecksCount;
  const isApproved = failedChecksCount === 0;
  const auditableRiskToken = `RISK-VERDICT-${Date.now().toString(36).toUpperCase()}-${isApproved ? 'APPR' : 'REJT'}-${secureRandomDigits(1000, 9999)}`;

  const enrichedChecks = checks.map((c) => ({
    ...c,
    gateId: c.gateId || c.checkName,
    gateName: c.gateName || c.checkName.replace(/_/g, ' '),
    status: (c.passed ? 'PASS' : c.severity === 'CRITICAL_REJECT' ? 'FAILED' : 'CAUTION') as 'PASS' | 'FAILED' | 'CAUTION',
    threshold: c.threshold !== undefined ? c.threshold : c.thresholdLimit,
    message: c.message || c.reason,
  }));

  return {
    isApproved,
    timestamp: Date.now(),
    orderIdProposed: order.id || order.orderId || 'PROPOSED-ORDER',
    symbol: order.symbol,
    totalChecksCount: checks.length,
    passedChecksCount,
    failedChecksCount,
    checks: enrichedChecks,
    rejectionReasons,
    auditableRiskToken,
  };
}
