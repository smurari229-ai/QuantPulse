import { generateSyntheticDailyBars, generateMarketSnapshot, validateMarketDataSeries } from '../src/engines/marketDataEngine';
import { evaluateRiskGates, DEFAULT_RISK_CONFIG } from '../src/engines/riskEngine';
import { INITIAL_PORTFOLIO_STATE, executePaperOrder } from '../src/engines/paperTradingEngine';
import { triggerEmergencyKillSwitch, resetKillSwitchWithVerification } from '../src/engines/killSwitchEngine';
import { runFullBacktest } from '../src/engines/backtestingLab';
import { AuditLogChain } from '../src/engines/auditEngine';
import type { OrderRequest } from '../src/types/order';
import type { BacktestParameters } from '../src/types/backtest';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SMOKE TEST FAILED: ${message}`);
}

const bars = generateSyntheticDailyBars('NIFTY50', 120);
assert(bars.length === 120, 'synthetic market generator returns requested bar count');
assert(validateMarketDataSeries(bars).isValid, 'generated market data passes validation');

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
assert(/^RISK-VERDICT-.*-(APPR|REJT)-\d{4}$/.test(staleVerdict.auditableRiskToken), 'risk verdict token has expected non-predictable suffix format');

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

const originalMaxNotional = DEFAULT_RISK_CONFIG.maxPositionSizeNotional;
Object.assign(DEFAULT_RISK_CONFIG, { maxPositionSizeNotional: 1 });
const settingsDrivenVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, snapshot);
assert(!settingsDrivenVerdict.isApproved, 'saved risk boundary is enforced by runtime risk evaluation');
assert(settingsDrivenVerdict.rejectionReasons.some(reason => reason.includes('Position size exceeds $1')), 'runtime verdict reflects saved notional boundary');
Object.assign(DEFAULT_RISK_CONFIG, { maxPositionSizeNotional: originalMaxNotional });

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
const auditRecord = auditLedger.appendRecord('ORDER_REJECTED', 'RISK_ENGINE', { apiKey: 'SECRET', symbol: 'NIFTY50' }, 'WARN');
assert(auditLedger.verifyChainIntegrity(), 'audit chain verifies immediately after append');
assert(!('apiKey' in auditRecord.details), 'audit records do not retain apiKey secrets');
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

const params: BacktestParameters = {
  strategyId: 'SMOKE_TREND', symbol: 'NIFTY50',
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
