import { BLOCKED_LIVE_BROKER_ADAPTER } from '../src/engines/liveBrokerAdapter';
import { generateSyntheticDailyBars, generateMarketSnapshot, getLiveSnapshot, validateMarketDataSeries } from '../src/engines/marketDataEngine';
import { evaluateRiskGates, DEFAULT_RISK_CONFIG } from '../src/engines/riskEngine';
import { INITIAL_PORTFOLIO_STATE, executePaperOrder } from '../src/engines/paperTradingEngine';
import { INITIAL_KILL_SWITCH_STATE, triggerEmergencyKillSwitch, resetKillSwitchWithVerification } from '../src/engines/killSwitchEngine';
import { runFullBacktest } from '../src/engines/backtestingLab';
import { evaluateStrategySignal, REGISTERED_STRATEGIES } from '../src/engines/strategyEngine';
import { calculateEMA, calculateRSI } from '../src/engines/marketAnalysisEngine';
import { generateAIDecision } from '../src/engines/aiDecisionEngine';
import { AuditLogChain } from '../src/engines/auditEngine';
import type { OrderRequest } from '../src/types/order';
import type { BacktestParameters } from '../src/types/backtest';
import { createOrderLifecycle, transitionOrder } from '../src/engines/orderStateMachine';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SMOKE TEST FAILED: ${message}`);
}

const lifecycle0 = createOrderLifecycle('SMOKE-ORDER-LIFECYCLE');
const lifecycle1 = transitionOrder(lifecycle0, 'VALIDATED', 'evt-1');
assert(lifecycle1.success && lifecycle1.lifecycle.state === 'VALIDATED', 'order lifecycle accepts CREATED -> VALIDATED');
const lifecycle2 = transitionOrder(lifecycle1.lifecycle, 'SUBMITTED', 'evt-2');
assert(lifecycle2.success && lifecycle2.lifecycle.state === 'SUBMITTED', 'order lifecycle accepts VALIDATED -> SUBMITTED');
const lifecycle3 = transitionOrder(lifecycle2.lifecycle, 'ACKNOWLEDGED', 'evt-3');
assert(lifecycle3.success && lifecycle3.lifecycle.state === 'ACKNOWLEDGED', 'order lifecycle accepts SUBMITTED -> ACKNOWLEDGED');
const lifecycle4 = transitionOrder(lifecycle3.lifecycle, 'PARTIALLY_FILLED', 'evt-4');
assert(lifecycle4.success && lifecycle4.lifecycle.state === 'PARTIALLY_FILLED', 'order lifecycle accepts ACKNOWLEDGED -> PARTIALLY_FILLED');
const lifecycle5 = transitionOrder(lifecycle4.lifecycle, 'FILLED', 'evt-5');
assert(lifecycle5.success && lifecycle5.lifecycle.state === 'FILLED', 'order lifecycle accepts PARTIALLY_FILLED -> FILLED');
const invalidAfterFill = transitionOrder(lifecycle5.lifecycle, 'SUBMITTED', 'evt-6');
assert(!invalidAfterFill.success && invalidAfterFill.lifecycle.state === 'FILLED', 'terminal FILLED state rejects backward transition');
const duplicateEvent = transitionOrder(lifecycle4.lifecycle, 'FILLED', 'evt-4');
assert(!duplicateEvent.success && duplicateEvent.lifecycle.state === 'PARTIALLY_FILLED', 'duplicate lifecycle event cannot mutate order state');
const cancelFlow1 = transitionOrder(createOrderLifecycle('SMOKE-CANCEL'), 'VALIDATED', 'c1');
const cancelFlow2 = transitionOrder(cancelFlow1.lifecycle, 'SUBMITTED', 'c2');
const cancelFlow3 = transitionOrder(cancelFlow2.lifecycle, 'ACKNOWLEDGED', 'c3');
const cancelFlow4 = transitionOrder(cancelFlow3.lifecycle, 'CANCEL_REQUESTED', 'c4');
assert(cancelFlow4.success, 'acknowledged order can request cancellation');
const cancelled = transitionOrder(cancelFlow4.lifecycle, 'CANCELLED', 'c5');
assert(cancelled.success && cancelled.lifecycle.state === 'CANCELLED', 'cancel request can become cancelled');
const lateFill = transitionOrder(cancelled.lifecycle, 'FILLED', 'c6');
assert(!lateFill.success && lateFill.lifecycle.state === 'CANCELLED', 'late fill after cancellation is rejected');
const rejectionFlow = transitionOrder(createOrderLifecycle('SMOKE-REJECT'), 'REJECTED', 'r1');
assert(rejectionFlow.success, 'created order can be rejected');
const rejectedAck = transitionOrder(rejectionFlow.lifecycle, 'ACKNOWLEDGED', 'r2');
assert(!rejectedAck.success && rejectedAck.lifecycle.state === 'REJECTED', 'rejected order cannot later be acknowledged');

const bars = generateSyntheticDailyBars('NIFTY50', 120);
assert(bars.length === 120, 'synthetic market generator returns requested bar count');
const unsupportedStrategyResult = evaluateStrategySignal({ id: 'UNKNOWN_STRATEGY', name: 'Unknown', type: 'MOMENTUM', description: '', entryConditions: [], exitConditions: [], stopLossRule: '', takeProfitRule: '', positionSizingMethod: 'FIXED_FRACTIONAL', requiredIndicators: [], assumptions: [], isActive: true, minConfidenceThreshold: 0.5 }, 'NIFTY50', bars);
assert(unsupportedStrategyResult.signal === 'NO_TRADE' && unsupportedStrategyResult.targetQuantity === 0, 'unknown strategy ids fail closed without falling through to another strategy');

const invalidIndicatorResult = evaluateStrategySignal(REGISTERED_STRATEGIES[0], 'NIFTY50', [{ ...bars[bars.length - 1], close: Number.NaN }]);
assert(invalidIndicatorResult.signal === 'NO_TRADE' && invalidIndicatorResult.targetQuantity === 0, 'invalid indicator inputs fail closed without producing an actionable signal');
assert(validateMarketDataSeries(bars).isValid, 'generated market data passes validation');
const trendStrategy = REGISTERED_STRATEGIES.find((strategy) => strategy.id === 'TF_EMA_CROSS')!;
const bullishFixture = Array.from({ length: 103 }, (_, i) => {
  const closes = i < 100 ? 100 : i === 100 ? 94 : i === 101 ? 99.5 : 105;
  const previousClose = i === 0 ? closes : (i - 1 < 100 ? 100 : i - 1 === 100 ? 94 : 99.5);
  const open = previousClose;
  const high = Math.max(open, closes) * 1.001;
  const low = Math.min(open, closes) * 0.999;
  return { timestamp: Date.now() - (103 - i) * 86_400_000, open, high, low, close: closes, volume: i === 102 ? 3_000_000 : 1_000_000 };
});
const trendSignal = evaluateStrategySignal(trendStrategy, 'NIFTY50', bullishFixture);
assert(trendSignal.signal === 'BUY', 'trend strategy generates the required BUY signal on a deterministic bullish crossover fixture');
assert(trendSignal.suggestedStopLoss > 0 && trendSignal.suggestedTakeProfit > trendSignal.suggestedEntry && trendSignal.riskRewardRatio >= 1.5, 'trend BUY contains valid protective stop, target, and risk/reward');

const meanReversionStrategy = REGISTERED_STRATEGIES.find((strategy) => strategy.id === 'MR_RSI_BOLLINGER')!;
const neutralSignal = evaluateStrategySignal(meanReversionStrategy, 'RELIANCE', bars);
assert(['HOLD', 'NO_TRADE'].includes(neutralSignal.signal), 'mean-reversion strategy stays non-actionable when oversold/lower-band conditions are absent');

const btTradeInvariantBars = generateSyntheticDailyBars('NIFTY50', 260);
const btProbeParams: BacktestParameters = {
  strategyId: 'TF_EMA_CROSS', symbol: 'NIFTY50',
  startDate: new Date(btTradeInvariantBars[0].timestamp).toISOString(),
  endDate: new Date(btTradeInvariantBars[btTradeInvariantBars.length - 1].timestamp).toISOString(),
  initialCapital: 100000, slippageModel: 'FIXED_BPS', slippageBps: 4.5,
  commissionRatePct: 0.03, taxRatePct: 0.01, outOfSampleSplitRatio: 0.2,
  enableWalkForward: true, walkForwardFolds: 3, positionSizingPct: 10,
};
const btProbe = runFullBacktest(btTradeInvariantBars, btProbeParams);
assert(btProbe.trades.every((trade) => trade.entryTimestamp > trade.exitTimestamp || trade.entryTimestamp <= trade.exitTimestamp), 'backtest timestamps are finite and chronologically comparable');
assert(btProbe.trades.every((trade) => trade.entryTimestamp <= trade.exitTimestamp), 'backtest never records an entry after its exit');
const btCloses = btTradeInvariantBars.map((bar) => bar.close);
const btEma20 = calculateEMA(btCloses, 20);
const btEma50 = calculateEMA(btCloses, 50);
const btRsi = calculateRSI(btCloses, 14);
const lookAheadSafeEntryTimestamps = new Set<number>();
for (let i = 24; i < btTradeInvariantBars.length - 1; i++) {
  const signalActive = btEma20[i] > btEma50[i] && btEma20[i - 1] <= btEma50[i - 1] && btRsi[i] < 65;
  if (signalActive) lookAheadSafeEntryTimestamps.add(btTradeInvariantBars[i + 1].timestamp);
}
assert(btProbe.trades.every((trade) => lookAheadSafeEntryTimestamps.has(trade.entryTimestamp)), 'backtest entries occur only on the bar immediately after a signal bar, with no future-bar entry timing');
assert(btProbe.combinedMetrics.sampleSizeWarning.recommendedMinTrades === 30, 'small-sample threshold is explicitly 30 trades');
if (btProbe.combinedMetrics.totalTrades < 30) {
  assert(btProbe.combinedMetrics.sampleSizeWarning.isUnderSampled, 'backtest emits an undersampled warning when trades are below 30');
  assert(Boolean(btProbe.combinedMetrics.sampleSizeWarning.warningMessage), 'undersampled backtest provides a statistical warning message');
} else {
  assert(!btProbe.combinedMetrics.sampleSizeWarning.isUnderSampled, 'backtest clears undersampled warning when at least 30 trades exist');
}
const frictionAccounting = btProbe.trades.reduce(
  (acc, trade) => ({ gross: acc.gross + trade.grossPnL, net: acc.net + trade.netPnL, fees: acc.fees + trade.feesPaid }),
  { gross: 0, net: 0, fees: 0 }
);
assert(Math.abs(frictionAccounting.net - (frictionAccounting.gross - frictionAccounting.fees)) < 0.11, 'net PnL equals gross PnL minus recorded fees after execution slippage is included in gross trade pricing');
assert(btProbe.combinedMetrics.totalSlippageCost >= 0 && btProbe.combinedMetrics.totalFeesPaid >= 0, 'friction metrics remain non-negative');


let invalidGeneratorRejected = false;
try { generateSyntheticDailyBars('NIFTY50', 0); } catch { invalidGeneratorRejected = true; }
assert(invalidGeneratorRejected, 'invalid synthetic bar count is rejected');
let unsupportedGeneratorRejected = false;
try { generateSyntheticDailyBars('UNSUPPORTED', 10); } catch { unsupportedGeneratorRejected = true; }
assert(unsupportedGeneratorRejected, 'unsupported market-data symbol is rejected by the historical generator');
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

const negativePriceBars = bars.map((bar) => ({ ...bar })); negativePriceBars[11].close = -1;
const negativePriceValidation = validateMarketDataSeries(negativePriceBars);
assert(!negativePriceValidation.isValid && negativePriceValidation.anomaliesDetected.negativePrice, 'negative price is rejected by market-data validation');
const zeroPriceBars = bars.map((bar) => ({ ...bar })); zeroPriceBars[11].close = 0;
const zeroPriceValidation = validateMarketDataSeries(zeroPriceBars);
assert(!zeroPriceValidation.isValid && zeroPriceValidation.anomaliesDetected.negativePrice, 'zero price is rejected by market-data validation');
const malformedBars = bars.map((bar) => ({ ...bar }));
malformedBars[10].close = Number.NaN;
const malformedMarketValidation = validateMarketDataSeries(malformedBars);
assert(!malformedMarketValidation.isValid, 'non-finite market price is rejected');
assert(malformedMarketValidation.errors.some(e => e.includes('Non-finite')), 'non-finite market error is reported safely');

const malformedTimestampBars = bars.map((bar) => ({ ...bar }));
malformedTimestampBars[5].timestamp = Number.NaN;
assert(!validateMarketDataSeries(malformedTimestampBars).isValid, 'non-finite timestamp is rejected without validator crash');
const negativeVolumeBars = bars.map((bar) => ({ ...bar }));
negativeVolumeBars[7].volume = -1;
const negativeVolumeValidation = validateMarketDataSeries(negativeVolumeBars);
assert(!negativeVolumeValidation.isValid && negativeVolumeValidation.errors.some(e => e.includes('Negative volume')), 'negative market volume is rejected');

const snapshot = generateMarketSnapshot('NIFTY50', bars[bars.length - 1].close);
const riskSafeSnapshot = { ...snapshot, timestamp: Date.now(), dataQuality: { ...snapshot.dataQuality, isStale: false, latencyMs: 45, isValidated: true } };

const staleHeuristicDecision = generateAIDecision({
  symbol: 'NIFTY50', timestamp: Date.now(), currentPrice: snapshot.lastPrice,
  indicators: { ema20: snapshot.lastPrice, ema50: snapshot.lastPrice, ema200: snapshot.lastPrice, rsi14: 55, atr14: snapshot.lastPrice * 0.01, relativeVolume: 1, marketRegime: 'BULLISH' } as any,
  currentMarketConditions: { spreadBps: 4, dataStalenessMs: 5001 },
});
assert(staleHeuristicDecision.signal === 'NO_TRADE' && staleHeuristicDecision.confidence === 0 && staleHeuristicDecision.strategy === 'STALE_DATA_HALT', 'heuristic AI fails closed to NO_TRADE when market data is stale');


const baseOrder: OrderRequest = {
  id: 'SMOKE-01', orderId: 'SMOKE-01', clientOrderId: 'SMOKE-CLI-01', symbol: 'NIFTY50', side: 'BUY',
  type: 'MARKET', quantity: 0.25, limitPrice: snapshot.lastPrice,
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
const invalidPaperOrder = executePaperOrder({ ...baseOrder, timestamp: Number.NaN }, INITIAL_PORTFOLIO_STATE, snapshot);
assert(invalidPaperOrder.status === 'REJECTED' && invalidPaperOrder.rejectionReason?.includes('timestamp'), 'paper execution rejects invalid order timestamp');

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

const maxNotionalOrder: OrderRequest = { ...baseOrder, id: 'SMOKE-NOTIONAL-01', orderId: 'SMOKE-NOTIONAL-01', clientOrderId: 'SMOKE-NOTIONAL-CLI-01', quantity: 20, estimatedPrice: 2000 };
const maxNotionalVerdict = evaluateRiskGates(maxNotionalOrder, INITIAL_PORTFOLIO_STATE, snapshot);
assert(!maxNotionalVerdict.isApproved && maxNotionalVerdict.checks.some(c => c.checkName === 'MAX_POSITION_NOTIONAL' && !c.passed), 'max position notional gate rejects a $40,000 order against the $25,000 default ceiling');
const maxNotionalPaperResult = executePaperOrder(maxNotionalOrder, INITIAL_PORTFOLIO_STATE, snapshot);
assert(maxNotionalPaperResult.status === 'REJECTED' && maxNotionalPaperResult.rejectionReason?.includes('deterministic risk engine'), 'paper execution boundary independently enforces the deterministic risk gate');

const customRiskConfig = { ...DEFAULT_RISK_CONFIG, maxPositionSizeNotional: 1 };
const settingsDrivenVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, snapshot, undefined, customRiskConfig);
const invalidConfigVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, snapshot, undefined, { ...DEFAULT_RISK_CONFIG, maxSpreadBps: Number.NaN });
assert(!invalidConfigVerdict.isApproved && invalidConfigVerdict.rejectionReasons.some(reason => reason.includes('Invalid or non-finite risk configuration')), 'invalid runtime risk configuration fails closed');
assert(invalidConfigVerdict.checks[0]?.gateName === 'RISK CONFIGURATION SANITY', 'invalid risk configuration uses its own gate identity');
const invalidOrderVerdict = evaluateRiskGates({ ...baseOrder, side: 'INVALID' as any, type: 'INVALID' as any, symbol: '' }, INITIAL_PORTFOLIO_STATE, snapshot);
assert(!invalidOrderVerdict.isApproved && invalidOrderVerdict.rejectionReasons.some(reason => reason.includes('Malformed order or market pricing input')), 'invalid order side/type/symbol fails closed');

const mismatchedSnapshot = generateMarketSnapshot('RELIANCE', 2940);
const mismatchedSymbolVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, mismatchedSnapshot);
assert(!mismatchedSymbolVerdict.isApproved && mismatchedSymbolVerdict.checks.some(c => c.checkName === 'ORDER_MARKET_SANITY' && !c.passed), 'risk engine rejects orders priced against a different market snapshot');
const mismatchedPaperResult = executePaperOrder(baseOrder, INITIAL_PORTFOLIO_STATE, mismatchedSnapshot);
assert(mismatchedPaperResult.status === 'REJECTED' && mismatchedPaperResult.rejectionReason?.includes('does not match'), 'paper execution rejects orders against a different market snapshot');

const anomalySnapshot = generateMarketSnapshot('NIFTY50', snapshot.lastPrice, { injectAnomaly: true });
const anomalyVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, anomalySnapshot);
assert(!anomalyVerdict.isApproved && anomalyVerdict.checks.some(c => c.checkName === 'ORDER_MARKET_SANITY' && !c.passed), 'risk engine rejects unvalidated market snapshots');
const anomalyPaperResult = executePaperOrder(baseOrder, INITIAL_PORTFOLIO_STATE, anomalySnapshot);
assert(anomalyPaperResult.status === 'REJECTED' && anomalyPaperResult.rejectionReason?.includes('not validated'), 'paper execution rejects unvalidated market snapshots');
const haltedPaperResult = executePaperOrder(baseOrder, INITIAL_PORTFOLIO_STATE, snapshot, { isExecutionHalted: true });
assert(haltedPaperResult.status === 'REJECTED' && haltedPaperResult.rejectionReason?.includes('kill switch'), 'paper execution rejects fills when execution is halted');

const invalidPortfolioVerdict = evaluateRiskGates(baseOrder, { ...INITIAL_PORTFOLIO_STATE, dayStartTimestamp: Number.NaN }, snapshot);
assert(!invalidPortfolioVerdict.isApproved && invalidPortfolioVerdict.checks.some(c => c.checkName === 'ORDER_MARKET_SANITY' && !c.passed), 'risk engine fails closed on invalid portfolio state');
let unsupportedSymbolRejected = false;
try { getLiveSnapshot('UNSUPPORTED', 100); } catch { unsupportedSymbolRejected = true; }
assert(unsupportedSymbolRejected, 'unsupported market-data symbol is rejected');
const audit = new AuditLogChain();
audit.appendRecord('RISK_GATE_REJECTED', 'RISK_ENGINE', { nested: { apiKey: 'should-not-leak', safe: 'ok' } });
assert(audit.verifyIntegrity().isValid, 'audit chain remains valid after sanitized record append');
const auditRecords = audit.getRecords(99999);
assert(auditRecords.length <= 1000, 'audit record retrieval limit is bounded');
let invalidWalkForwardRejected = false;
try { runFullBacktest(bars, { symbol: 'NIFTY50', initialCapital: 100000, outOfSampleSplitRatio: 0.2, positionSizingPct: 10, slippageBps: 5, commissionRatePct: 0.1, taxRatePct: 0, slippageModel: 'FIXED_BPS', enableWalkForward: true, walkForwardFolds: 1 } as BacktestParameters); } catch { invalidWalkForwardRejected = true; }
assert(invalidWalkForwardRejected, 'invalid walk-forward fold count is rejected');
let unsupportedBacktestSymbolRejected = false;
try { runFullBacktest(bars, { symbol: 'UNSUPPORTED', initialCapital: 100000, outOfSampleSplitRatio: 0.2, positionSizingPct: 10, slippageBps: 5, commissionRatePct: 0.1, taxRatePct: 0, slippageModel: 'FIXED_BPS', enableWalkForward: true, walkForwardFolds: 3 } as BacktestParameters); } catch { unsupportedBacktestSymbolRejected = true; }
assert(unsupportedBacktestSymbolRejected, 'unsupported backtest symbol is rejected by the input guard');
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

const manuallyLockedState = { ...INITIAL_KILL_SWITCH_STATE, isGlobalTradingOff: true, requiresManualReset: false };
const unauthorizedOperationalReset = resetKillSwitchWithVerification(manuallyLockedState, '');
assert(!unauthorizedOperationalReset.success && unauthorizedOperationalReset.updatedState.isGlobalTradingOff, 'active operational lock cannot be cleared without out-of-band authorization even when reset flag is malformed');

const emaFixture = [10, 11, 12, 13, 14];
const ema = calculateEMA(emaFixture, 3);
assert(ema.length === emaFixture.length && Math.abs(ema[1] - 10.5) < 1e-10 && Math.abs(ema[4] - 13.0625) < 1e-10, 'EMA matches the recursive mathematical formula on a known fixture');
const rsi = calculateRSI([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119], 14);
assert(rsi.every((value) => Number.isFinite(value) && value >= 0 && value <= 100), 'RSI remains finite and bounded to [0, 100]');

const missingStopVerdict = evaluateRiskGates(
  { ...baseOrder, id: 'SMOKE-STOPLOSS-01', orderId: 'SMOKE-STOPLOSS-01', stopLossPrice: 0 },
  INITIAL_PORTFOLIO_STATE,
  riskSafeSnapshot
);
assert(!missingStopVerdict.isApproved && missingStopVerdict.checks.some(c => c.checkName === 'MANDATORY_STOP_LOSS' && !c.passed), 'mandatory stop-loss gate rejects an order without a valid stop');

const lossLockedPortfolio = { ...INITIAL_PORTFOLIO_STATE, dayStartEquity: 100000, dayStartTimestamp: Date.now() - 60_000, equity: 96800 };
const dailyLossVerdict = evaluateRiskGates(baseOrder, lossLockedPortfolio, riskSafeSnapshot);
assert(!dailyLossVerdict.isApproved && dailyLossVerdict.checks.some(c => c.checkName === 'MAX_DAILY_LOSS' && !c.passed), 'daily-loss circuit breaker rejects new orders after the configured loss limit');

const duplicateVerdict = evaluateRiskGates(
  baseOrder,
  INITIAL_PORTFOLIO_STATE,
  riskSafeSnapshot,
  { recentOrders: [{ id: 'DUP-1', symbol: baseOrder.symbol, side: baseOrder.side, quantity: baseOrder.quantity, timestamp: Date.now() - 10_000 }] }
);
assert(!duplicateVerdict.isApproved && duplicateVerdict.checks.some(c => c.checkName === 'DUPLICATE_ORDER_DETECTION' && !c.passed), 'duplicate-order gate suppresses an identical order inside the configured window');

const heartbeatVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, riskSafeSnapshot, { brokerHeartbeatActive: false });
assert(!heartbeatVerdict.isApproved && heartbeatVerdict.checks.some(c => c.checkName === 'BROKER_CONNECTIVITY_HEARTBEAT' && !c.passed), 'broker heartbeat failure blocks order routing');

const invertedBars = bars.map((bar) => ({ ...bar }));
invertedBars[12].high = invertedBars[12].low - 1;
const invertedValidation = validateMarketDataSeries(invertedBars);
assert(!invertedValidation.isValid && invertedValidation.anomaliesDetected.highLowInversion, 'market-data validator rejects High/Low inversion');

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

const directBuyRiskVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, riskSafeSnapshot);
assert(directBuyRiskVerdict.isApproved, `baseline paper BUY risk preflight approves: ${directBuyRiskVerdict.rejectionReasons.join(' | ')}`);
const buyResult = executePaperOrder(baseOrder, INITIAL_PORTFOLIO_STATE, riskSafeSnapshot);
assert(buyResult.status === 'FILLED' && buyResult.updatedPortfolio.positions.length === 1, 'paper BUY creates a position');
const held = buyResult.updatedPortfolio.positions[0];
const buyPnlInvariant = buyResult.updatedPortfolio.equity - (buyResult.updatedPortfolio.initialCapital + buyResult.updatedPortfolio.totalRealizedPnL + buyResult.updatedPortfolio.totalUnrealizedPnL);
assert(Math.abs(buyPnlInvariant) < 0.01, 'paper BUY accounting invariant: equity equals capital plus realized plus unrealized P&L');
assert(held.entryCharges > 0, 'paper position retains entry-side charges for future P&L accounting');

const sellOrder: OrderRequest = {
  ...baseOrder, id: 'SMOKE-02', orderId: 'SMOKE-02', clientOrderId: 'SMOKE-CLI-02', side: 'SELL', quantity: held.quantity,
  stopLossPrice: snapshot.lastPrice * 1.04, takeProfitPrice: snapshot.lastPrice * 0.92,
};
const sellResult = executePaperOrder(sellOrder, buyResult.updatedPortfolio, riskSafeSnapshot);
assert(sellResult.status === 'FILLED' && sellResult.updatedPortfolio.positions.length === 0, 'paper SELL closes the held position');
const sellPnlInvariant = sellResult.updatedPortfolio.equity - (sellResult.updatedPortfolio.initialCapital + sellResult.updatedPortfolio.totalRealizedPnL + sellResult.updatedPortfolio.totalUnrealizedPnL);
assert(Math.abs(sellPnlInvariant) < 0.01, 'paper SELL accounting invariant: equity equals capital plus realized plus unrealized P&L');
assert(Math.abs(sellResult.updatedPortfolio.totalUnrealizedPnL) < 0.01, 'fully closed paper position has no residual unrealized P&L');

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

const corruptedBacktestBars = bars.map((bar) => ({ ...bar }));
corruptedBacktestBars[5].close = Number.NaN;
let corruptedBacktestRejected = false;
try { runFullBacktest(corruptedBacktestBars, params); } catch { corruptedBacktestRejected = true; }
assert(corruptedBacktestRejected, 'backtest rejects malformed market data before simulation');

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
let unsupportedPublicBacktestRejected = false;
try { runFullBacktest(bars, { ...params, symbol: 'UNSUPPORTED' as any }); } catch { unsupportedPublicBacktestRejected = true; }
assert(unsupportedPublicBacktestRejected, 'public backtest entry rejects unsupported symbols');

const liveHealth = await BLOCKED_LIVE_BROKER_ADAPTER.getHealth();
assert(liveHealth.connected === false && liveHealth.authenticated === false && liveHealth.liveTradingAuthorized === false, 'Live broker adapter health must remain disconnected and unauthorized by default');
let liveSubmitBlocked = false;
try {
  await BLOCKED_LIVE_BROKER_ADAPTER.submitOrder({} as any);
} catch (error) {
  liveSubmitBlocked = String(error).includes('LIVE_ORDER_BLOCKED');
}
assert(liveSubmitBlocked, 'Live broker adapter must fail closed without authorization');
let liveCancelBlocked = false;
try {
  await BLOCKED_LIVE_BROKER_ADAPTER.cancelOrder('SMOKE-LIVE-CANCEL');
} catch (error) {
  liveCancelBlocked = String(error).includes('LIVE_CANCEL_BLOCKED');
}
assert(liveCancelBlocked, 'Live broker cancellation must fail closed without authorization');
let liveReconciliationBlocked = false;
try {
  await BLOCKED_LIVE_BROKER_ADAPTER.reconcilePortfolio();
} catch (error) {
  liveReconciliationBlocked = String(error).includes('LIVE_RECONCILIATION_BLOCKED');
}
assert(liveReconciliationBlocked, 'Live broker reconciliation must fail closed without authorization');

console.log('QUANTPULSE SMOKE TESTS: PASS');
console.log(JSON.stringify({ bars: bars.length, trades: backtest.trades.length, oosTrades: backtest.outOfSampleMetrics.totalTrades, walkForwardFolds: backtest.walkForwardResults.length }, null, 2));
