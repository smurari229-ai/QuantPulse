import { generateSyntheticDailyBars, generateMarketSnapshot, getLiveSnapshot, validateMarketDataSeries } from '../src/engines/marketDataEngine';
import { evaluateRiskGates, DEFAULT_RISK_CONFIG } from '../src/engines/riskEngine';
import { INITIAL_PORTFOLIO_STATE, executePaperOrder } from '../src/engines/paperTradingEngine';
import { triggerEmergencyKillSwitch, resetKillSwitchWithVerification } from '../src/engines/killSwitchEngine';
import { runFullBacktest } from '../src/engines/backtestingLab';
import { evaluateStrategySignal, REGISTERED_STRATEGIES } from '../src/engines/strategyEngine';
import { AuditLogChain } from '../src/engines/auditEngine';
import type { OrderRequest } from '../src/types/order';
import type { BacktestParameters } from '../src/types/backtest';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SMOKE TEST FAILED: ${message}`);
}

const bars = generateSyntheticDailyBars('NIFTY50', 120);
assert(bars.length === 120, 'synthetic market generator returns requested bar count');
const unsupportedStrategyResult = evaluateStrategySignal({ id: 'UNKNOWN_STRATEGY', name: 'Unknown', type: 'MOMENTUM', description: '', entryConditions: [], exitConditions: [], stopLossRule: '', takeProfitRule: '', positionSizingMethod: 'FIXED_FRACTIONAL', requiredIndicators: [], assumptions: [], isActive: true, minConfidenceThreshold: 0.5 }, 'NIFTY50', bars);
assert(unsupportedStrategyResult.signal === 'NO_TRADE' && unsupportedStrategyResult.targetQuantity === 0, 'unknown strategy ids fail closed without falling through to another strategy');

const invalidIndicatorResult = evaluateStrategySignal(REGISTERED_STRATEGIES[0], 'NIFTY50', [{ ...bars[bars.length - 1], close: Number.NaN }]);
assert(invalidIndicatorResult.signal === 'NO_TRADE' && invalidIndicatorResult.targetQuantity === 0, 'invalid indicator inputs fail closed without producing an actionable signal');
assert(validateMarketDataSeries(bars).isValid, 'generated market data passes validation');

let invalidGeneratorRejected = false;
try { generateSyntheticDailyBars('NIFTY50', 0); } catch { invalidGeneratorRejected = true; }
assert(invalidGeneratorRejected, 'invalid synthetic bar count is rejected');
let invalidVolatilityRejected = false;
try { generateSyntheticDailyBars('NIFTY50', 10, undefined, 0); } catch { invalidVolatilityRejected = true; }
assert(invalidVolatilityRejected, 'zero synthetic volatility is rejected');
const latencySnapshot = getLiveSnapshot('NIFTY50', bars[bars.length - 1].close, { latencyMs: 5000, isStale: false });
assert(latencySnapshot.dataQuality.latencyMs === 5000 && latencySnapshot.timestamp <= Date.now() - 4990, 'configured simulated latency is reflected in snapshot timestamp');
assert(!evaluateRiskGates({
  id: 'SMOKE-LATENCY', orderId: 'SMOKE-LATENCY', clientOrderId: 'SMOKE-LATENCY', symbol: 'NIFTY50', side: 'BUY', type: 'MARKET', quantity: 1,
  limitPrice: latencySnapshot.lastPrice, stopLossPrice: latencySnapshot.lastPrice * 0.96, takeProfitPrice: latencySnapshot.lastPrice * 1.08,
  executionMode: 'PAPER', timestamp: Date.now(),
}, INITIAL_PORTFOLIO_STATE, latencySnapshot).checks.find(c => c.checkName === 'STALE_DATA_GUARD')?.passed, '5-second simulated latency trips stale-data risk gate');

const malformedBars = bars.map((bar) => ({ ...bar }));
malformedBars[10].close = Number.NaN;
const malformedMarketValidation = validateMarketDataSeries(malformedBars);
assert(!malformedMarketValidation.isValid, 'non-finite market price is rejected');
assert(malformedMarketValidation.errors.some(e => e.includes('Non-finite')), 'non-finite market error is reported safely');

const malformedTimestampBars = bars.map((bar) => ({ ...bar }));
malformedTimestampBars[5].timestamp = Number.NaN;
assert(!validateMarketDataSeries(malformedTimestampBars).isValid, 'non-finite timestamp is rejected without validator crash');

const snapshot = generateMarketSnapshot('NIFTY50', bars[bars.length - 1].close);

const baseOrder: OrderRequest = {
  id: 'SMOKE-01', orderId: 'SMOKE-01', clientOrderId: 'SMOKE-CLI-01', symbol: 'NIFTY50', side: 'BUY',
  type: 'MARKET', quantity: 1, limitPrice: snapshot.lastPrice,
  stopLossPrice: snapshot.lastPrice * 0.96, takeProfitPrice: snapshot.lastPrice * 1.08,
  executionMode: 'PAPER', timestamp: Date.now(),
};

const staleSnapshot = {
  ...snapshot,
  timestamp: Date.now() - 5000,
  dataQuality: { ...snapshot.dataQuality, isStale: true, latencyMs: 5000 },
};
const staleVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, staleSnapshot);
assert(!staleVerdict.isApproved, 'stale market data is rejected');
assert(staleVerdict.checks.some(c => c.checkName === 'STALE_DATA_GUARD' && !c.passed), 'stale-data gate fails');

const riskCheckNames = staleVerdict.checks.map(c => c.checkName);
assert(new Set(riskCheckNames).size === riskCheckNames.length, 'risk gate check names are unique');
assert(riskCheckNames.includes('MAX_POSITION_NOTIONAL'), 'notional gate has stable unique identity');
assert(riskCheckNames.includes('MAX_POSITION_PCT_OF_PORTFOLIO'), 'portfolio-percent gate has stable unique identity');
assert(/^RISK-VERDICT-.*-(APPR|REJT)-\d{4}$/.test(staleVerdict.auditableRiskToken), 'risk verdict token has expected suffix format');

const malformedOrder = { ...baseOrder, quantity: -1 };
const malformedVerdict = evaluateRiskGates(malformedOrder, INITIAL_PORTFOLIO_STATE, snapshot);
assert(!malformedVerdict.isApproved, 'negative order quantity is rejected');
assert(malformedVerdict.checks.some(c => c.checkName === 'ORDER_MARKET_SANITY' && !c.passed), 'order sanity gate rejects malformed quantity');

const invalidEstimatedPriceOrder = { ...baseOrder, estimatedPrice: 0 };
const invalidEstimatedPriceVerdict = evaluateRiskGates(invalidEstimatedPriceOrder, INITIAL_PORTFOLIO_STATE, snapshot);
assert(invalidEstimatedPriceVerdict.checks.some(c => c.checkName === 'ORDER_MARKET_SANITY' && !c.passed), 'explicit zero estimated price is rejected instead of silently falling back');

const futureOrderTimestampVerdict = evaluateRiskGates(
  baseOrder,
  INITIAL_PORTFOLIO_STATE,
  snapshot,
  { lastOrderTimestamps: { NIFTY50: Date.now() + 60_000 } }
);
assert(!futureOrderTimestampVerdict.checks.find(c => c.checkName === 'ORDER_FREQUENCY_THROTTLE')?.passed, 'future last-order timestamp is rejected');
assert(futureOrderTimestampVerdict.rejectionReasons.some(reason => reason.includes('future order timestamp')), 'future order timestamp produces explicit rejection reason');

const futureDuplicateVerdict = evaluateRiskGates(
  baseOrder,
  INITIAL_PORTFOLIO_STATE,
  snapshot,
  { recentOrders: [{ id: 'FUTURE', symbol: 'NIFTY50', side: 'BUY', quantity: 1, timestamp: Date.now() + 60_000 }] }
);
assert(futureDuplicateVerdict.checks.find(c => c.checkName === 'DUPLICATE_ORDER_DETECTION')?.passed, 'future order record is not misclassified as a duplicate');

const customRiskConfig = { ...DEFAULT_RISK_CONFIG, maxPositionSizeNotional: 1 };
const settingsDrivenVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, snapshot, undefined, customRiskConfig);
const invalidConfigVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, snapshot, undefined, { ...DEFAULT_RISK_CONFIG, maxSpreadBps: Number.NaN });
assert(!invalidConfigVerdict.isApproved && invalidConfigVerdict.rejectionReasons.some(reason => reason.includes('Invalid or non-finite risk configuration')), 'invalid runtime risk configuration fails closed');
const invalidOrderVerdict = evaluateRiskGates({ ...baseOrder, side: 'INVALID' as any, type: 'INVALID' as any, symbol: '' }, INITIAL_PORTFOLIO_STATE, snapshot);
assert(!invalidOrderVerdict.isApproved && invalidOrderVerdict.rejectionReasons.some(reason => reason.includes('Malformed order or market pricing input')), 'invalid order side/type/symbol fails closed');
let unsupportedSymbolRejected = false;
try { getLiveSnapshot('UNSUPPORTED', 100); } catch { unsupportedSymbolRejected = true; }
assert(unsupportedSymbolRejected, 'unsupported market-data symbol is rejected');
const audit = new AuditLogChain();
audit.appendRecord('ORDER_REJECTED', 'RISK_ENGINE', { nested: { apiKey: 'should-not-leak', safe: 'ok' } });
assert(audit.verifyIntegrity().isValid, 'audit chain remains valid after sanitized record append');
const auditRecords = audit.getRecords(99999);
assert(auditRecords.length <= 1000, 'audit record retrieval limit is bounded');
let invalidWalkForwardRejected = false;
try { runFullBacktest(bars, { symbol: 'NIFTY50', initialCapital: 100000, outOfSampleSplitRatio: 0.2, positionSizingPct: 10, slippageBps: 5, commissionRatePct: 0.1, taxRatePct: 0, slippageModel: 'FIXED_BPS', enableWalkForward: true, walkForwardFolds: 1 } as BacktestParameters); } catch { invalidWalkForwardRejected = true; }
assert(invalidWalkForwardRejected, 'invalid walk-forward fold count is rejected');
assert(!settingsDrivenVerdict.isApproved, 'runtime risk evaluation enforces the supplied saved risk boundary');
assert(settingsDrivenVerdict.rejectionReasons.some(reason => reason.includes('Position size exceeds $1')), 'runtime verdict reflects supplied saved notional boundary');

const exposurePrice = snapshot.lastPrice;
const exposurePortfolio = {
  ...INITIAL_PORTFOLIO_STATE,
  positions: [{
    symbol: 'NIFTY50', quantity: 65000 / exposurePrice, averageEntryPrice: exposurePrice, currentPrice: exposurePrice,
    marketValue: 65000, unrealizedPnL: 0, unrealizedPnLPct: 0, realizedPnL: 0,
    stopLossPrice: exposurePrice * 0.95, takeProfitPrice: exposurePrice * 1.05,
    notionalExposurePct: 65, highestPriceSinceEntry: exposurePrice, openedAt: Date.now(),
  }],
  positionsCount: 1,
  portfolioExposurePct: 65,
};
const reducingSell: OrderRequest = {
  ...baseOrder, id: 'SMOKE-EXPOSURE-SELL', orderId: 'SMOKE-EXPOSURE-SELL', clientOrderId: 'SMOKE-EXPOSURE-CLI', side: 'SELL',
  quantity: 10000 / exposurePrice, stopLossPrice: exposurePrice * 1.05, takeProfitPrice: exposurePrice * 0.90,
};
const reducingSellVerdict = evaluateRiskGates(reducingSell, exposurePortfolio, snapshot);
const exposureGate = reducingSellVerdict.checks.find(c => c.checkName === 'MAX_PORTFOLIO_EXPOSURE');
assert(exposureGate?.passed, 'selling an existing position reduces projected portfolio exposure instead of adding it');
assert(Number(String(exposureGate?.currentValue).replace('%', '')) < 56, 'sell exposure projection reflects the exposure reduction');

const killState = triggerEmergencyKillSwitch('smoke-test');
assert(/^\d{6}$/.test(killState.resetConfirmationCode), 'kill-switch reset code is a six-digit numeric authorization code');
const killVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, snapshot, { isEmergencyKillSwitchActive: killState.isEmergencyStopTripped });
assert(!killVerdict.isApproved, 'kill switch blocks risk approval');
assert(killVerdict.checks.some(c => c.currentValue === 'ACTIVE_HALTED'), 'kill-switch gate reports active halt');
const badReset = resetKillSwitchWithVerification(killState, 'WRONG');
assert(!badReset.success && badReset.updatedState.isEmergencyStopTripped, 'wrong reset code keeps kill switch engaged');
const goodReset = resetKillSwitchWithVerification(killState, killState.resetConfirmationCode);
assert(goodReset.success && !goodReset.updatedState.isEmergencyStopTripped, 'correct reset code re-arms sandbox');

const auditLedger = new AuditLogChain();
const auditRecord = auditLedger.appendRecord(
  'RISK_GATE_REJECTED',
  'RISK_ENGINE',
  { apiKey: 'SECRET', symbol: 'NIFTY50', nested: { password: '123', accessToken: 'TOKEN' } },
  'WARNING'
);
assert(auditLedger.verifyChainIntegrity(), 'audit chain verifies immediately after append');
assert(auditRecord.details.apiKey === '[REDACTED]', 'audit records redact apiKey secrets');
assert((auditRecord.details.nested as Record<string, unknown>).password === '[REDACTED]', 'audit records redact nested password secrets');
assert((auditRecord.details.nested as Record<string, unknown>).accessToken === '[REDACTED]', 'audit records redact nested token secrets');
const tamperRecord = auditLedger.getAllRecords(2)[0];
tamperRecord.details.symbol = 'TAMPERED';
assert(!auditLedger.verifyChainIntegrity(), 'audit chain detects record tampering');

const buyResult = executePaperOrder(baseOrder, INITIAL_PORTFOLIO_STATE, snapshot);
assert(buyResult.status === 'FILLED' && buyResult.updatedPortfolio.positions.length === 1, 'paper BUY creates a position');
const held = buyResult.updatedPortfolio.positions[0];
const sellOrder: OrderRequest = {
  ...baseOrder, id: 'SMOKE-02', orderId: 'SMOKE-02', clientOrderId: 'SMOKE-CLI-02', side: 'SELL', quantity: held.quantity,
  stopLossPrice: snapshot.lastPrice * 1.04, takeProfitPrice: snapshot.lastPrice * 0.92,
};
const sellResult = executePaperOrder(sellOrder, buyResult.updatedPortfolio, snapshot);
assert(sellResult.status === 'FILLED' && sellResult.updatedPortfolio.positions.length === 0, 'paper SELL closes the held position');
const invalidSell = executePaperOrder(sellOrder, INITIAL_PORTFOLIO_STATE, snapshot);
assert(invalidSell.status === 'REJECTED', 'paper SELL without a position is rejected');

const marketableLimitOrder: OrderRequest = {
  ...baseOrder, id: 'SMOKE-LIMIT-01', orderId: 'SMOKE-LIMIT-01', clientOrderId: 'SMOKE-LIMIT-CLI-01', type: 'LIMIT',
  limitPrice: snapshot.ask, stopLossPrice: snapshot.ask * 0.96, takeProfitPrice: snapshot.ask * 1.08,
};
const marketableLimit = executePaperOrder(marketableLimitOrder, INITIAL_PORTFOLIO_STATE, snapshot, { customSlippageBps: 0 });
assert(marketableLimit.status === 'FILLED' && marketableLimit.fill?.price <= snapshot.ask, 'marketable limit BUY fills without exceeding its limit price');

const nonMarketableLimitOrder: OrderRequest = { ...marketableLimitOrder, id: 'SMOKE-LIMIT-02', orderId: 'SMOKE-LIMIT-02', limitPrice: snapshot.bid * 0.99 };
const nonMarketableLimit = executePaperOrder(nonMarketableLimitOrder, INITIAL_PORTFOLIO_STATE, snapshot, { customSlippageBps: 0 });
assert(nonMarketableLimit.status === 'REJECTED' && nonMarketableLimit.rejectionReason?.includes('not marketable'), 'non-marketable limit BUY does not execute immediately');

const unsupportedStopOrder: OrderRequest = { ...baseOrder, id: 'SMOKE-STOP-01', orderId: 'SMOKE-STOP-01', type: 'STOP_MARKET' };
const unsupportedStop = executePaperOrder(unsupportedStopOrder, INITIAL_PORTFOLIO_STATE, snapshot);
assert(unsupportedStop.status === 'REJECTED' && unsupportedStop.rejectionReason?.includes('STOP_MARKET'), 'unsupported stop-market order is rejected explicitly');

const nonPaperOrder = { ...baseOrder, executionMode: 'OFFLINE' as const };
const nonPaperResult = executePaperOrder(nonPaperOrder, INITIAL_PORTFOLIO_STATE, snapshot);
assert(nonPaperResult.status === 'REJECTED' && nonPaperResult.rejectionReason?.includes('PAPER execution mode'), 'non-PAPER execution mode is rejected by the paper engine');

const invalidSideOrder = { ...baseOrder, side: 'HOLD' as never };
const invalidSideResult = executePaperOrder(invalidSideOrder, INITIAL_PORTFOLIO_STATE, snapshot);
assert(invalidSideResult.status === 'REJECTED' && invalidSideResult.rejectionReason?.includes('side must be BUY or SELL'), 'invalid runtime order side is rejected');

const params: BacktestParameters = {
  strategyId: 'TF_EMA_CROSS', symbol: 'NIFTY50',
  startDate: new Date(bars[0].timestamp).toISOString(),
  endDate: new Date(bars[bars.length - 1].timestamp).toISOString(),
  initialCapital: 100000, slippageModel: 'FIXED_BPS', slippageBps: 4.5,
  commissionRatePct: 0.03, taxRatePct: 0.01, outOfSampleSplitRatio: 0.2,
  enableWalkForward: true, walkForwardFolds: 3, positionSizingPct: 10,
};
const backtest = runFullBacktest(bars, params);
assert(backtest.equityCurve.length === bars.length, 'backtest equity curve covers all bars');
assert(backtest.trades.every(t => t.entryTimestamp <= t.exitTimestamp), 'backtest trade timestamps are ordered');
assert(backtest.outOfSampleMetrics.totalTrades === backtest.trades.filter(t => t.isOutOfSample).length, 'OOS metrics match OOS trade classification');
const splitTimestamp = bars[Math.floor(bars.length * (1 - params.outOfSampleSplitRatio))].timestamp;
assert(
  backtest.inSampleMetrics.totalTrades === backtest.trades.filter(t => !t.isOutOfSample && t.exitTimestamp < splitTimestamp).length,
  'in-sample metrics exclude trades whose exit crosses into OOS'
);
assert(backtest.walkForwardResults.length <= params.walkForwardFolds, 'walk-forward result count respects requested folds');
assert(backtest.equityCurve.every(point => Number.isFinite(point.equity) && Number.isFinite(point.drawdownPct)), 'equity curve values remain finite');

const zeroSlippageBacktest = runFullBacktest(bars, { ...params, slippageModel: 'ZERO' });
assert(zeroSlippageBacktest.combinedMetrics.totalSlippageCost === 0, 'ZERO slippage model charges zero slippage');
assert(backtest.combinedMetrics.totalSlippageCost >= 0, 'FIXED_BPS slippage cost is non-negative');
if (backtest.trades.length > 0) assert(backtest.combinedMetrics.totalSlippageCost > 0, 'FIXED_BPS slippage model charges configured impact when trades exist');
const volatilitySlippageBacktest = runFullBacktest(bars, { ...params, slippageModel: 'VOLATILITY_SQUARE_ROOT' });
assert(Number.isFinite(volatilitySlippageBacktest.combinedMetrics.totalSlippageCost), 'VOLATILITY_SQUARE_ROOT slippage cost remains finite');
assert(volatilitySlippageBacktest.combinedMetrics.totalSlippageCost >= 0, 'VOLATILITY_SQUARE_ROOT slippage cost is non-negative');

let invalidCostRejected = false;
try { runFullBacktest(bars, { ...params, slippageBps: -1 }); } catch { invalidCostRejected = true; }
assert(invalidCostRejected, 'negative slippage configuration is rejected');

let invalidCommissionRejected = false;
try { runFullBacktest(bars, { ...params, commissionRatePct: Number.NaN }); } catch { invalidCommissionRejected = true; }
assert(invalidCommissionRejected, 'non-finite commission configuration is rejected');

console.log('QUANTPULSE SMOKE TESTS: PASS');
console.log(JSON.stringify({ bars: bars.length, trades: backtest.trades.length, oosTrades: backtest.outOfSampleMetrics.totalTrades, walkForwardFolds: backtest.walkForwardResults.length }, null, 2));
