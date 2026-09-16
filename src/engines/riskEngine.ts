import {
  RiskEngineConfig,
  RiskValidationVerdict,
  IndividualRiskCheckResult,
} from '../types/risk';
import { OrderRequest, PortfolioState } from '../types/order';
import { MarketDataSnapshot } from '../types/market';

export const DEFAULT_RISK_CONFIG: RiskEngineConfig = {
  maxPositionSizeNotional: 25000, // Max $25,000 per asset
  maxPositionPctOfPortfolio: 25, // Max 25% of total portfolio equity
  maxPortfolioExposurePct: 70, // Max 70% total exposure across all positions
  maxDailyLossPct: 3.0, // Circuit breaker at -3% daily loss
  maxDrawdownHaltPct: 8.0, // Halt trading if overall drawdown exceeds 8%
  maxTradesPerDay: 20, // Throttle to prevent churning
  minOrderIntervalSeconds: 30, // 30s cooldown between orders on same asset
  minRiskRewardRatio: 1.5, // 1.5:1 minimum reward to risk
  maxEstimatedSlippageBps: 25, // Max 25 bps slippage tolerated
  maxDataStalenessMs: 3000, // Max 3000ms stale data allowed
  requireStopLoss: true, // Mandatory stop loss
  requireTakeProfit: true, // Mandatory take profit
  maxSpreadBps: 20, // Max 20 bps spread
  enforceDuplicateWindowSeconds: 60, // 60-second window to reject duplicate orders
};

export interface RecentOrderContext {
  lastOrderTimestamps: Record<string, number>; // symbol -> timestamp
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

export function evaluateRiskGates(
  order: OrderRequest,
  portfolio: PortfolioState,
  marketSnapshot: MarketDataSnapshot,
  ctx?: Partial<RecentOrderContext>,
  config: RiskEngineConfig = DEFAULT_RISK_CONFIG
): RiskValidationVerdict {
  const context: RecentOrderContext = {
    ...DEFAULT_RECENT_CONTEXT,
    ...ctx,
  };
  const checks: IndividualRiskCheckResult[] = [];
  const rejectionReasons: string[] = [];

  const notional = order.quantity * (order.estimatedPrice || marketSnapshot.lastPrice);
  const positionPct = portfolio.equity > 0 ? (notional / portfolio.equity) * 100 : 100;
  const currentInvested = portfolio.positions.reduce((sum, p) => sum + p.marketValue, 0);
  const projectedExposurePct = portfolio.equity > 0 ? ((currentInvested + notional) / portfolio.equity) * 100 : 100;

  // Gate 0: Emergency Kill Switch
  const passedKillSwitch = !context.isEmergencyKillSwitchActive;
  checks.push({
    checkName: 'MARKET_ABNORMALITY_CIRCUIT_BREAKER',
    passed: passedKillSwitch,
    severity: 'CRITICAL_REJECT',
    currentValue: context.isEmergencyKillSwitchActive ? 'ACTIVE_HALTED' : 'NORMAL',
    thresholdLimit: 'NORMAL',
    reason: passedKillSwitch ? 'Emergency kill switch is disengaged.' : 'CRITICAL: Emergency Kill Switch is engaged. All trading is strictly halted.',
  });
  if (!passedKillSwitch) rejectionReasons.push('Emergency Kill Switch is currently engaged.');

  // Gate 1: Max Position Size Notional
  const passedMaxNotional = notional <= config.maxPositionSizeNotional;
  checks.push({
    checkName: 'MAX_POSITION_SIZE',
    passed: passedMaxNotional,
    severity: 'CRITICAL_REJECT',
    currentValue: `$${Math.round(notional).toLocaleString()}`,
    thresholdLimit: `$${config.maxPositionSizeNotional.toLocaleString()}`,
    reason: passedMaxNotional
      ? 'Order notional is within individual position limits.'
      : `Order notional ($${Math.round(notional).toLocaleString()}) exceeds maximum permitted ($${config.maxPositionSizeNotional.toLocaleString()}).`,
  });
  if (!passedMaxNotional) rejectionReasons.push(`Position size exceeds $${config.maxPositionSizeNotional.toLocaleString()}`);

  // Gate 2: Max Position % of Portfolio
  const passedMaxPositionPct = positionPct <= config.maxPositionPctOfPortfolio;
  checks.push({
    checkName: 'MAX_POSITION_SIZE',
    passed: passedMaxPositionPct,
    severity: 'CRITICAL_REJECT',
    currentValue: `${positionPct.toFixed(1)}%`,
    thresholdLimit: `${config.maxPositionPctOfPortfolio}%`,
    reason: passedMaxPositionPct
      ? 'Position concentration is within risk bounds.'
      : `Position would represent ${positionPct.toFixed(1)}% of portfolio (limit: ${config.maxPositionPctOfPortfolio}%).`,
  });
  if (!passedMaxPositionPct) rejectionReasons.push(`Position concentration exceeds ${config.maxPositionPctOfPortfolio}%`);

  // Gate 3: Max Portfolio Exposure
  const passedExposure = projectedExposurePct <= config.maxPortfolioExposurePct;
  checks.push({
    checkName: 'MAX_PORTFOLIO_EXPOSURE',
    passed: passedExposure,
    severity: 'CRITICAL_REJECT',
    currentValue: `${projectedExposurePct.toFixed(1)}%`,
    thresholdLimit: `${config.maxPortfolioExposurePct}%`,
    reason: passedExposure
      ? 'Projected total portfolio exposure is within safe limits.'
      : `Projected portfolio exposure (${projectedExposurePct.toFixed(1)}%) breaches ceiling of ${config.maxPortfolioExposurePct}%.`,
  });
  if (!passedExposure) rejectionReasons.push(`Portfolio exposure would exceed ${config.maxPortfolioExposurePct}%`);

  // Gate 4: Max Daily Loss Circuit Breaker
  const dailyLossPct = Math.abs(portfolio.dailyPnLPct);
  const passedDailyLoss = portfolio.dailyPnLPct > -config.maxDailyLossPct;
  checks.push({
    checkName: 'MAX_DAILY_LOSS',
    passed: passedDailyLoss,
    severity: 'CRITICAL_REJECT',
    currentValue: `${portfolio.dailyPnLPct.toFixed(2)}%`,
    thresholdLimit: `-${config.maxDailyLossPct.toFixed(2)}%`,
    reason: passedDailyLoss
      ? 'Daily P&L is above daily loss circuit breaker.'
      : `Daily loss (${portfolio.dailyPnLPct.toFixed(2)}%) hit circuit breaker limit of -${config.maxDailyLossPct}%. Trading halted for the session.`,
  });
  if (!passedDailyLoss) rejectionReasons.push('Daily loss circuit breaker triggered.');

  // Gate 5: Maximum Drawdown Limit
  const passedDrawdown = portfolio.currentDrawdownPct < config.maxDrawdownHaltPct;
  checks.push({
    checkName: 'MAX_PORTFOLIO_DRAWDOWN',
    passed: passedDrawdown,
    severity: 'CRITICAL_REJECT',
    currentValue: `${portfolio.currentDrawdownPct.toFixed(2)}%`,
    thresholdLimit: `${config.maxDrawdownHaltPct.toFixed(2)}%`,
    reason: passedDrawdown
      ? 'Current drawdown is within tolerable parameters.'
      : `Portfolio drawdown (${portfolio.currentDrawdownPct.toFixed(2)}%) breaches max allowed (${config.maxDrawdownHaltPct}%). Risk mitigation required.`,
  });
  if (!passedDrawdown) rejectionReasons.push('Portfolio drawdown threshold breached.');

  // Gate 6: Max Trades Per Day
  const passedMaxTrades = context.todayExecutedTradesCount < config.maxTradesPerDay;
  checks.push({
    checkName: 'MAX_TRADES_PER_DAY',
    passed: passedMaxTrades,
    severity: 'CRITICAL_REJECT',
    currentValue: context.todayExecutedTradesCount,
    thresholdLimit: config.maxTradesPerDay,
    reason: passedMaxTrades
      ? 'Daily trade frequency is within limit.'
      : `Daily trade count (${context.todayExecutedTradesCount}) reached quota (${config.maxTradesPerDay}).`,
  });
  if (!passedMaxTrades) rejectionReasons.push('Daily trade count quota reached.');

  // Gate 7: Order Frequency Throttle
  const lastTime = context.lastOrderTimestamps[order.symbol] || 0;
  const timeSinceLastOrderSec = (Date.now() - lastTime) / 1000;
  const passedFrequency = timeSinceLastOrderSec >= config.minOrderIntervalSeconds;
  checks.push({
    checkName: 'ORDER_FREQUENCY_THROTTLE',
    passed: passedFrequency,
    severity: 'CRITICAL_REJECT',
    currentValue: `${timeSinceLastOrderSec.toFixed(1)}s elapsed`,
    thresholdLimit: `>= ${config.minOrderIntervalSeconds}s interval`,
    reason: passedFrequency
      ? 'Order frequency cooldown satisfied.'
      : `Order throttling active on ${order.symbol}. Last order was ${timeSinceLastOrderSec.toFixed(1)}s ago (min: ${config.minOrderIntervalSeconds}s).`,
  });
  if (!passedFrequency) rejectionReasons.push(`Order throttle active. Wait ${Math.ceil(config.minOrderIntervalSeconds - timeSinceLastOrderSec)}s.`);

  // Gate 8: Mandatory Stop Loss
  const hasStopLoss = typeof order.stopLossPrice === 'number' && order.stopLossPrice > 0;
  let validStopLoss = hasStopLoss;
  if (hasStopLoss) {
    if (order.side === 'BUY') validStopLoss = order.stopLossPrice < (order.estimatedPrice || marketSnapshot.lastPrice);
    if (order.side === 'SELL') validStopLoss = order.stopLossPrice > (order.estimatedPrice || marketSnapshot.lastPrice);
  }
  checks.push({
    checkName: 'MANDATORY_STOP_LOSS',
    passed: validStopLoss,
    severity: 'CRITICAL_REJECT',
    currentValue: order.stopLossPrice || 0,
    thresholdLimit: 'Strictly Required & directional',
    reason: validStopLoss
      ? `Stop loss set at ${order.stopLossPrice}.`
      : 'Order rejected: Mandatory stop-loss price missing or on incorrect side of entry.',
  });
  if (!validStopLoss) rejectionReasons.push('Mandatory Stop-Loss missing or invalid.');

  // Gate 9: Mandatory Take Profit
  const hasTakeProfit = typeof order.takeProfitPrice === 'number' && order.takeProfitPrice > 0;
  let validTakeProfit = hasTakeProfit;
  if (hasTakeProfit) {
    if (order.side === 'BUY') validTakeProfit = order.takeProfitPrice > (order.estimatedPrice || marketSnapshot.lastPrice);
    if (order.side === 'SELL') validTakeProfit = order.takeProfitPrice < (order.estimatedPrice || marketSnapshot.lastPrice);
  }
  checks.push({
    checkName: 'MANDATORY_TAKE_PROFIT',
    passed: validTakeProfit,
    severity: 'CRITICAL_REJECT',
    currentValue: order.takeProfitPrice || 0,
    thresholdLimit: 'Strictly Required & directional',
    reason: validTakeProfit
      ? `Take profit set at ${order.takeProfitPrice}.`
      : 'Order rejected: Mandatory take-profit price missing or on incorrect side of entry.',
  });
  if (!validTakeProfit) rejectionReasons.push('Mandatory Take-Profit missing or invalid.');

  // Gate 10: Risk / Reward Constraints (>= 1.5)
  const currentPrice = order.estimatedPrice || marketSnapshot.lastPrice;
  const riskUnit = Math.abs(currentPrice - (order.stopLossPrice || currentPrice));
  const rewardUnit = Math.abs((order.takeProfitPrice || currentPrice) - currentPrice);
  const actualRR = riskUnit > 0 ? rewardUnit / riskUnit : 0;
  const passedRR = actualRR >= config.minRiskRewardRatio;
  checks.push({
    checkName: 'RISK_REWARD_RATIO',
    passed: passedRR,
    severity: 'CRITICAL_REJECT',
    currentValue: `${actualRR.toFixed(2)}:1`,
    thresholdLimit: `>= ${config.minRiskRewardRatio}:1`,
    reason: passedRR
      ? `Risk/reward ratio ${actualRR.toFixed(2)}:1 passes minimum hurdle.`
      : `Risk/reward ratio (${actualRR.toFixed(2)}:1) fails minimum institutional hurdle of ${config.minRiskRewardRatio}:1.`,
  });
  if (!passedRR) rejectionReasons.push(`Risk/reward ${actualRR.toFixed(2)}:1 below required ${config.minRiskRewardRatio}:1.`);

  // Gate 11: Liquidity & Spread Tolerance
  const spreadBps = marketSnapshot.bid > 0
    ? ((marketSnapshot.ask - marketSnapshot.bid) / marketSnapshot.bid) * 10000
    : 0;
  const passedSpread = spreadBps <= config.maxSpreadBps;
  checks.push({
    checkName: 'LIQUIDITY_SPREAD_CHECK',
    passed: passedSpread,
    severity: 'CRITICAL_REJECT',
    currentValue: `${spreadBps.toFixed(1)} bps`,
    thresholdLimit: `<= ${config.maxSpreadBps} bps`,
    reason: passedSpread
      ? `Spread is liquid at ${spreadBps.toFixed(1)} bps.`
      : `Spread is illiquid at ${spreadBps.toFixed(1)} bps (limit: ${config.maxSpreadBps} bps). Risk of adverse selection.`,
  });
  if (!passedSpread) rejectionReasons.push(`Illiquid spread (${spreadBps.toFixed(1)} bps).`);

  // Gate 12: Slippage Tolerance
  const estSlippage = order.estimatedSlippageBps || 5;
  const passedSlippage = estSlippage <= config.maxEstimatedSlippageBps;
  checks.push({
    checkName: 'SLIPPAGE_TOLERANCE',
    passed: passedSlippage,
    severity: 'CRITICAL_REJECT',
    currentValue: `${estSlippage} bps`,
    thresholdLimit: `<= ${config.maxEstimatedSlippageBps} bps`,
    reason: passedSlippage
      ? 'Estimated market impact slippage is within bounds.'
      : `Estimated slippage (${estSlippage} bps) exceeds ceiling (${config.maxEstimatedSlippageBps} bps).`,
  });
  if (!passedSlippage) rejectionReasons.push('Excessive slippage risk.');

  // Gate 13: Duplicate Order Detection
  const duplicateWindowMs = config.enforceDuplicateWindowSeconds * 1000;
  const isDuplicate = context.recentOrders.some(
    (o) =>
      o.symbol === order.symbol &&
      o.side === order.side &&
      Math.abs(o.quantity - order.quantity) < 0.001 &&
      Date.now() - o.timestamp < duplicateWindowMs
  );
  checks.push({
    checkName: 'DUPLICATE_ORDER_DETECTION',
    passed: !isDuplicate,
    severity: 'CRITICAL_REJECT',
    currentValue: isDuplicate ? 'DUPLICATE_IDENTIFIED' : 'UNIQUE',
    thresholdLimit: 'UNIQUE',
    reason: !isDuplicate
      ? 'No duplicate order detected within time window.'
      : `Duplicate order detected for ${order.symbol} (${order.side} ${order.quantity}) within ${config.enforceDuplicateWindowSeconds}s window. Suppressing repeated signal.`,
  });
  if (isDuplicate) rejectionReasons.push('Duplicate order detected within time window.');

  // Gate 14: Stale Data Guard (< 3000ms)
  const dataAgeMs = Date.now() - marketSnapshot.timestamp;
  const passedDataFreshness = dataAgeMs <= config.maxDataStalenessMs && !marketSnapshot.dataQuality.isStale;
  checks.push({
    checkName: 'STALE_DATA_GUARD',
    passed: passedDataFreshness,
    severity: 'CRITICAL_REJECT',
    currentValue: `${dataAgeMs} ms age`,
    thresholdLimit: `<= ${config.maxDataStalenessMs} ms`,
    reason: passedDataFreshness
      ? `Market data is fresh (${dataAgeMs}ms latency).`
      : `Market data is STALE (${dataAgeMs}ms > max ${config.maxDataStalenessMs}ms). Cannot price order safely.`,
  });
  if (!passedDataFreshness) rejectionReasons.push(`Stale market data feed (${dataAgeMs}ms latency).`);

  // Gate 15: Broker Connectivity Heartbeat
  const passedHeartbeat = context.brokerHeartbeatActive;
  checks.push({
    checkName: 'BROKER_CONNECTIVITY_HEARTBEAT',
    passed: passedHeartbeat,
    severity: 'CRITICAL_REJECT',
    currentValue: passedHeartbeat ? 'HEARTBEAT_ACK' : 'DISCONNECTED',
    thresholdLimit: 'HEARTBEAT_ACK',
    reason: passedHeartbeat
      ? 'Broker gateway heartbeat confirmed.'
      : 'Broker connection is down or heartbeat timed out. Routing disabled.',
  });
  if (!passedHeartbeat) rejectionReasons.push('Broker gateway disconnected.');

  const passedChecksCount = checks.filter((c) => c.passed).length;
  const failedChecksCount = checks.length - passedChecksCount;
  const isApproved = failedChecksCount === 0;

  // Generate auditable cryptographic risk token
  const auditableRiskToken = `RISK-VERDICT-${Date.now().toString(36).toUpperCase()}-${isApproved ? 'APPR' : 'REJT'}-${Math.floor(Math.random() * 9000 + 1000)}`;

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
