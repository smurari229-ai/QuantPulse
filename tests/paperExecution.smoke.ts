import { PaperExecutionLedger } from '../src/engines/paperExecutionLedger';
import { generateAIDecision } from '../src/engines/aiDecisionEngine';
import { generateMarketSnapshot } from '../src/engines/marketDataEngine';
import { INITIAL_PORTFOLIO_STATE } from '../src/engines/paperTradingEngine';
import { DEFAULT_RISK_CONFIG, evaluateRiskGates } from '../src/engines/riskEngine';
import { triggerEmergencyKillSwitch } from '../src/engines/killSwitchEngine';
import type { OrderFill, OrderRequest, PortfolioState } from '../src/types/order';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`PAPER EXECUTION TEST FAILED: ${message}`);
}

const snapshot = generateMarketSnapshot('RELIANCE', 100);
const portfolio: PortfolioState = { ...INITIAL_PORTFOLIO_STATE, cash: 1_000_000, initialCapital: 1_000_000, equity: 1_000_000, dayStartEquity: 1_000_000, peakEquity: 1_000_000, availableMargin: 1_000_000, positions: [], positionsCount: 0 };
const order: OrderRequest = { id: 'PAPER-PARTIAL-100', orderId: 'PAPER-PARTIAL-100', clientOrderId: 'PAPER-PARTIAL-CLIENT', symbol: 'RELIANCE', side: 'BUY', type: 'MARKET', quantity: 100, estimatedPrice: 100, stopLossPrice: 95, takeProfitPrice: 110, executionMode: 'PAPER', timestamp: Date.now() };

function fillFor(targetOrder: OrderRequest, fillId: string, quantity: number, price: number, brokerOrderId: string): OrderFill {
  return { fillId, orderId: targetOrder.id, symbol: targetOrder.symbol, side: targetOrder.side, quantity, price, slippageIncurredBps: 0, slippageBps: 0, brokerFee: 1, brokerageFee: 1, exchangeFee: 0, taxesApplicable: 0, totalCharges: 1, timestamp: Date.now(), brokerOrderId };
}

const ledger = new PaperExecutionLedger();
assert(ledger.submitOrder(order, 'SUBMIT-1').success, 'order submits');
assert(ledger.getReservedCash() === 10_000, 'BUY cash is reserved');
const first = ledger.recordFill(order.id, fillFor(order, 'FILL-30', 30, 100, 'BROKER-1'), portfolio, snapshot, 'EVENT-30');
assert(first.success && first.order?.lifecycle.state === 'PARTIALLY_FILLED' && first.order.filledQuantity === 30, '30-unit partial fill applies');
const second = ledger.recordFill(order.id, fillFor(order, 'FILL-20', 20, 101, 'BROKER-1'), first.portfolio!, snapshot, 'EVENT-20');
assert(second.success && second.order?.filledQuantity === 50 && second.order.remainingQuantity === 50, '20-unit partial fill accumulates');
const brokerChange = ledger.recordFill(order.id, fillFor(order, 'FILL-BROKER-CHANGE', 1, 101, 'BROKER-CHANGED'), second.portfolio!, snapshot, 'EVENT-BROKER-CHANGE');
assert(!brokerChange.success && brokerChange.reason?.includes('changed'), 'brokerOrderId cannot change');
const third = ledger.recordFill(order.id, fillFor(order, 'FILL-50', 50, 102, 'BROKER-1'), second.portfolio!, snapshot, 'EVENT-50');
assert(third.success && third.order?.lifecycle.state === 'FILLED' && third.order.remainingQuantity === 0, '50-unit final fill closes order');
assert(ledger.getReservedCash() === 0 && third.portfolio?.positions[0]?.quantity === 100, 'full fill releases reservation and leaves 100 units');
assert(Math.abs((third.portfolio?.equity ?? 0) - ((third.portfolio?.initialCapital ?? 0) + (third.portfolio?.totalRealizedPnL ?? 0) + (third.portfolio?.totalUnrealizedPnL ?? 0))) < 0.01, 'partial-fill equity/P&L invariant holds');
const duplicateClient = ledger.submitOrder({ ...order, id: 'DUP-CLIENT', orderId: 'DUP-CLIENT' }, 'SUBMIT-DUP-CLIENT');
assert(!duplicateClient.success && duplicateClient.reason?.includes('client order ID'), 'duplicate clientOrderId rejects');
const duplicateFill = ledger.recordFill(order.id, fillFor(order, 'FILL-50', 50, 102, 'BROKER-1'), third.portfolio!, snapshot, 'EVENT-DUP-FILL');
assert(!duplicateFill.success && duplicateFill.reason?.includes('fill ID'), 'duplicate fillId rejects');
const duplicateEvent = ledger.recordFill(order.id, fillFor(order, 'FILL-NEW', 1, 102, 'BROKER-1'), third.portfolio!, snapshot, 'EVENT-50');
assert(!duplicateEvent.success && duplicateEvent.reason?.includes('event'), 'duplicate event ID rejects');

const cancelLedger = new PaperExecutionLedger();
const cancelOrder: OrderRequest = { ...order, id: 'CANCEL-100', orderId: 'CANCEL-100', clientOrderId: 'CANCEL-CLIENT' };
assert(cancelLedger.submitOrder(cancelOrder, 'SUBMIT-CANCEL').success, 'cancel order submits');
let cancelPortfolio: PortfolioState = portfolio;
for (const [id, quantity, price] of [['C-30', 30, 100], ['C-20', 20, 101], ['C-20B', 20, 102]] as const) {
  const result = cancelLedger.recordFill(cancelOrder.id, fillFor(cancelOrder, id, quantity, price, 'BROKER-CANCEL'), cancelPortfolio, snapshot, `EVENT-${id}`);
  assert(result.success && result.portfolio, `fill ${id} applies`);
  cancelPortfolio = result.portfolio;
}
assert(cancelLedger.getOrder(cancelOrder.id)?.filledQuantity === 70, '30+20+20 produces 70 filled');
const cancelled = cancelLedger.cancelOrder(cancelOrder.id, 'EVENT-CANCEL');
assert(cancelled.success && cancelled.order?.lifecycle.state === 'CANCELLED' && cancelled.order.remainingQuantity === 0 && cancelLedger.getReservedCash() === 0, 'remaining 30 units cancel and reservation clears');
const lateFill = cancelLedger.recordFill(cancelOrder.id, fillFor(cancelOrder, 'C-LATE', 10, 101, 'BROKER-CANCEL'), cancelPortfolio, snapshot, 'EVENT-LATE');
assert(!lateFill.success && lateFill.reason?.includes('CANCELLED'), 'late fill after cancellation rejects');

const brokerLedger = new PaperExecutionLedger();
const brokerA: OrderRequest = { ...order, id: 'BROKER-A', orderId: 'BROKER-A', clientOrderId: 'BROKER-A-CLIENT', quantity: 1 };
const brokerB: OrderRequest = { ...order, id: 'BROKER-B', orderId: 'BROKER-B', clientOrderId: 'BROKER-B-CLIENT', quantity: 1 };
assert(brokerLedger.submitOrder(brokerA, 'SUBMIT-A').success && brokerLedger.submitOrder(brokerB, 'SUBMIT-B').success, 'two broker-ID test orders submit');
assert(brokerLedger.recordFill(brokerA.id, fillFor(brokerA, 'BROKER-FILL-A', 1, 100, 'BROKER-SHARED'), portfolio, snapshot, 'FILL-A').success, 'first broker ID binds');
const brokerCollision = brokerLedger.recordFill(brokerB.id, fillFor(brokerB, 'BROKER-FILL-B', 1, 100, 'BROKER-SHARED'), portfolio, snapshot, 'FILL-B');
assert(!brokerCollision.success && brokerCollision.reason?.includes('already bound'), 'brokerOrderId cannot bind to another order');

const reconLedger = new PaperExecutionLedger();
const reconOrder: OrderRequest = { ...order, id: 'RECON-1', orderId: 'RECON-1', clientOrderId: 'RECON-CLIENT', quantity: 10 };
assert(reconLedger.submitOrder(reconOrder, 'RECON-SUBMIT').success, 'reconciliation order submits');
const reconFill = reconLedger.recordFill(reconOrder.id, fillFor(reconOrder, 'RECON-FILL', 10, 100, 'RECON-BROKER'), portfolio, snapshot, 'RECON-FILL-EVENT');
assert(reconFill.success && reconFill.portfolio, 'reconciliation order fills');
const matching = reconLedger.reconcile({ timestamp: Date.now(), maxAgeMs: 5000, orders: [{ orderId: reconOrder.id, clientOrderId: reconOrder.clientOrderId, brokerOrderId: 'RECON-BROKER', state: 'FILLED', quantity: 10, filledQuantity: 10, averageFillPrice: 100 }], positions: [{ symbol: 'RELIANCE', quantity: 10, averageEntryPrice: 100 }], cash: reconFill.portfolio.cash }, reconFill.portfolio);
assert(matching.isReconciled && matching.mismatches.length === 0, 'matching reconciliation passes');
const mismatch = reconLedger.reconcile({ timestamp: Date.now(), maxAgeMs: 5000, orders: [{ orderId: reconOrder.id, clientOrderId: reconOrder.clientOrderId, brokerOrderId: 'RECON-BROKER', state: 'FILLED', quantity: 10, filledQuantity: 9, averageFillPrice: 99 }], positions: [{ symbol: 'RELIANCE', quantity: 9, averageEntryPrice: 99 }], cash: reconFill.portfolio.cash + 1 }, reconFill.portfolio);
assert(!mismatch.isReconciled && mismatch.mismatches.length >= 3, 'reconciliation detects order/position/cash mismatches');
const stale = reconLedger.reconcile({ timestamp: Date.now() - 10_000, maxAgeMs: 5000, orders: [], positions: [], cash: reconFill.portfolio.cash }, reconFill.portfolio);
assert(!stale.isReconciled && stale.mismatches.some((m) => m.key === 'reconciliation-timestamp'), 'stale reconciliation rejects');
const future = reconLedger.reconcile({ timestamp: Date.now() + 10_000, maxAgeMs: 5000, orders: [], positions: [], cash: reconFill.portfolio.cash }, reconFill.portfolio);
assert(!future.isReconciled && future.mismatches.some((m) => m.reason.includes('future-dated')), 'future reconciliation rejects');

const aiBase = { symbol: 'NIFTY50', timestamp: Date.now(), currentPrice: 24850, indicators: { ema20: 24800, ema50: 24700, ema200: 24000, rsi14: 55, atr14: 120, relativeVolume: 1.1, marketRegime: 'NORMAL' }, currentMarketConditions: { spreadBps: 4, dataStalenessMs: 50 } };
const invalidRsi = generateAIDecision({ ...aiBase, indicators: { ...aiBase.indicators, rsi14: 101 } });
assert(invalidRsi.signal === 'NO_TRADE' && invalidRsi.confidence === 0, 'AI rejects out-of-range RSI');
const negativeSpread = generateAIDecision({ ...aiBase, currentMarketConditions: { ...aiBase.currentMarketConditions, spreadBps: -1 } });
assert(negativeSpread.signal === 'NO_TRADE' && negativeSpread.confidence === 0, 'AI rejects negative spread');


const failureOrder: OrderRequest = { ...order, id: 'FAILURE-MATRIX', orderId: 'FAILURE-MATRIX', clientOrderId: 'FAILURE-MATRIX-CLIENT', quantity: 1, stopLossPrice: 95, takeProfitPrice: 110 };
const staleSnapshot = { ...snapshot, timestamp: Date.now() - 10_000, dataQuality: { ...snapshot.dataQuality, isStale: true, latencyMs: 10_000 } };
const staleVerdict = evaluateRiskGates(failureOrder, portfolio, staleSnapshot, undefined, DEFAULT_RISK_CONFIG);
assert(!staleVerdict.isApproved && staleVerdict.rejectionReasons.some((reason) => reason.toLowerCase().includes('stale')), 'failure matrix blocks stale market data');

const oversizedVerdict = evaluateRiskGates({ ...failureOrder, quantity: 500 }, portfolio, snapshot, undefined, DEFAULT_RISK_CONFIG);
assert(!oversizedVerdict.isApproved && oversizedVerdict.checks.some((check) => check.checkName === 'MAX_POSITION_NOTIONAL' && !check.passed), 'failure matrix blocks oversized orders');

const missingStopVerdict = evaluateRiskGates({ ...failureOrder, stopLossPrice: 0 }, portfolio, snapshot, undefined, DEFAULT_RISK_CONFIG);
assert(!missingStopVerdict.isApproved && missingStopVerdict.checks.some((check) => check.checkName === 'MANDATORY_STOP_LOSS' && !check.passed), 'failure matrix blocks missing stop-loss');

const dailyLossPortfolio = { ...portfolio, equity: portfolio.dayStartEquity * 0.965 };
const dailyLossVerdict = evaluateRiskGates(failureOrder, dailyLossPortfolio, snapshot, undefined, DEFAULT_RISK_CONFIG);
assert(!dailyLossVerdict.isApproved && dailyLossVerdict.checks.some((check) => check.checkName === 'MAX_DAILY_LOSS' && !check.passed), 'failure matrix blocks daily-loss breach');

const heartbeatVerdict = evaluateRiskGates(failureOrder, portfolio, snapshot, { brokerHeartbeatActive: false }, DEFAULT_RISK_CONFIG);
assert(!heartbeatVerdict.isApproved && heartbeatVerdict.checks.some((check) => check.checkName === 'BROKER_CONNECTIVITY_HEARTBEAT' && !check.passed), 'failure matrix blocks broker heartbeat failure');

const killState = triggerEmergencyKillSwitch('failure-matrix');
const killVerdict = evaluateRiskGates(failureOrder, portfolio, snapshot, { isEmergencyKillSwitchActive: killState.isEmergencyStopTripped }, DEFAULT_RISK_CONFIG);
assert(!killVerdict.isApproved && killVerdict.checks.some((check) => check.checkName === 'MARKET_ABNORMALITY_CIRCUIT_BREAKER' && !check.passed), 'failure matrix blocks active emergency kill switch');

const malformedPortfolio = { ...portfolio, cash: Number.NaN };
const malformedVerdict = evaluateRiskGates(failureOrder, malformedPortfolio, snapshot, undefined, DEFAULT_RISK_CONFIG);
assert(!malformedVerdict.isApproved && malformedVerdict.checks.some((check) => check.checkName === 'ORDER_MARKET_SANITY' && !check.passed), 'failure matrix blocks malformed portfolio state');

console.log('QUANTPULSE PAPER EXECUTION TESTS: PASS');
