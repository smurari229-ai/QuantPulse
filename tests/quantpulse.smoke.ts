import { generateSyntheticDailyBars, generateMarketSnapshot, validateMarketDataSeries } from '../src/engines/marketDataEngine';
import { evaluateRiskGates } from '../src/engines/riskEngine';
import { INITIAL_PORTFOLIO_STATE, executePaperOrder } from '../src/engines/paperTradingEngine';
import { triggerEmergencyKillSwitch, resetKillSwitchWithVerification } from '../src/engines/killSwitchEngine';
import { runFullBacktest } from '../src/engines/backtestingLab';
import type { OrderRequest } from '../src/types/order';
import type { BacktestParameters } from '../src/types/backtest';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SMOKE TEST FAILED: ${message}`);
}

const bars = generateSyntheticDailyBars('NIFTY50', 120);
assert(bars.length === 120, 'synthetic market generator returns requested bar count');
assert(validateMarketDataSeries(bars).isValid, 'generated market data passes validation');
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

const malformedOrder = { ...baseOrder, quantity: -1 };
const malformedVerdict = evaluateRiskGates(malformedOrder, INITIAL_PORTFOLIO_STATE, snapshot);
assert(!malformedVerdict.isApproved, 'negative order quantity is rejected');
assert(malformedVerdict.checks.some(c => c.checkName === 'ORDER_MARKET_SANITY' && !c.passed), 'order sanity gate rejects malformed quantity');

const killState = triggerEmergencyKillSwitch('smoke-test');
const killVerdict = evaluateRiskGates(baseOrder, INITIAL_PORTFOLIO_STATE, snapshot, { isEmergencyKillSwitchActive: killState.isEmergencyStopTripped });
assert(!killVerdict.isApproved, 'kill switch blocks risk approval');
assert(killVerdict.checks.some(c => c.currentValue === 'ACTIVE_HALTED'), 'kill-switch gate reports active halt');
const badReset = resetKillSwitchWithVerification(killState, 'WRONG');
assert(!badReset.success && badReset.updatedState.isEmergencyStopTripped, 'wrong reset code keeps kill switch engaged');
const goodReset = resetKillSwitchWithVerification(killState, killState.resetConfirmationCode);
assert(goodReset.success && !goodReset.updatedState.isEmergencyStopTripped, 'correct reset code re-arms sandbox');

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

console.log('QUANTPULSE SMOKE TESTS: PASS');
console.log(JSON.stringify({ bars: bars.length, trades: backtest.trades.length, oosTrades: backtest.outOfSampleMetrics.totalTrades, walkForwardFolds: backtest.walkForwardResults.length }, null, 2));
