import { OHLCV } from '../types/market';
import {
  BacktestParameters,
  BacktestRunResult,
  BacktestTrade,
  QuantitativeMetrics,
  WalkForwardPeriodResult,
} from '../types/backtest';
import { calculateEMA, calculateRSI, calculateATR } from './marketAnalysisEngine';

export function runFullBacktest(
  bars: OHLCV[],
  params: BacktestParameters
): BacktestRunResult {
  if (bars.length === 0) {
    throw new Error('Backtest requires at least one OHLCV bar.');
  }
  if (params.initialCapital <= 0) {
    throw new Error('Backtest initial capital must be greater than zero.');
  }
  if (params.outOfSampleSplitRatio <= 0 || params.outOfSampleSplitRatio >= 1) {
    throw new Error('outOfSampleSplitRatio must be between 0 and 1.');
  }
  if (params.positionSizingPct <= 0 || params.positionSizingPct > 100) {
    throw new Error('positionSizingPct must be greater than 0 and at most 100.');
  }
  if (!Number.isFinite(params.slippageBps) || params.slippageBps < 0) {
    throw new Error('slippageBps must be a finite non-negative number.');
  }
  if (!Number.isFinite(params.commissionRatePct) || params.commissionRatePct < 0) {
    throw new Error('commissionRatePct must be a finite non-negative number.');
  }
  if (!Number.isFinite(params.taxRatePct) || params.taxRatePct < 0) {
    throw new Error('taxRatePct must be a finite non-negative number.');
  }

  const splitIndex = Math.min(
    Math.max(Math.floor(bars.length * (1 - params.outOfSampleSplitRatio)), 1),
    Math.max(bars.length - 1, 1)
  );
  const splitTimestamp = bars[Math.min(splitIndex, bars.length - 1)].timestamp;

  // Simulate the complete series once so indicator warm-up is continuous across
  // the IS/OOS boundary. Trades are classified by their entry timestamp.
  const allTrades = simulateBars(bars, params, splitTimestamp);
  const inSampleTrades = allTrades.filter((t) => !t.isOutOfSample);
  const outOfSampleTrades = allTrades.filter((t) => t.isOutOfSample);

  const inSampleBars = bars.slice(0, splitIndex);
  const outOfSampleBars = bars.slice(splitIndex);
  const combinedMetrics = calculateQuantitativeMetrics(allTrades, params.initialCapital, bars);
  const inSampleMetrics = calculateQuantitativeMetrics(inSampleTrades, params.initialCapital, inSampleBars);
  const outOfSampleMetrics = calculateQuantitativeMetrics(outOfSampleTrades, params.initialCapital, outOfSampleBars);

  // Rolling walk-forward validation. Each test window receives only the history
  // immediately before that window for indicator warm-up. Metrics/trades are
  // still classified strictly to the test window, preventing future leakage.
  const walkForwardResults: WalkForwardPeriodResult[] = [];
  const requestedFolds = Math.max(2, Math.min(Math.floor(params.walkForwardFolds || 3), 10));
  if (params.enableWalkForward && bars.length >= 60) {
    const minimumTrainBars = 30;
    const availableTestBars = bars.length - minimumTrainBars;
    const testSize = Math.max(10, Math.floor(availableTestBars / requestedFolds));

    for (let f = 0; f < requestedFolds; f++) {
      const testStart = minimumTrainBars + f * testSize;
      if (testStart >= bars.length) break;
      const testEnd = Math.min(bars.length, testStart + testSize);
      const trainSlice = bars.slice(0, testStart);
      const testSlice = bars.slice(testStart, testEnd);
      if (trainSlice.length < 25 || testSlice.length < 10) continue;

      const foldParams = { ...params, enableWalkForward: false };
      const warmupBars = trainSlice.slice(Math.max(0, trainSlice.length - 50));
      const simulationBars = [...warmupBars, ...testSlice];
      const testStartTimestamp = testSlice[0].timestamp;
      const foldTrades = simulateBars(simulationBars, foldParams, testStartTimestamp);
      const trainSim = simulateBars(trainSlice, foldParams, Number.POSITIVE_INFINITY);
      const testSim = foldTrades.filter((trade) => trade.entryTimestamp >= testStartTimestamp);
      const trainMet = calculateQuantitativeMetrics(trainSim, params.initialCapital, trainSlice);
      const testMet = calculateQuantitativeMetrics(testSim, params.initialCapital, testSlice);
      const degradationRatio = trainMet.sharpeRatio !== 0
        ? Math.round((testMet.sharpeRatio / trainMet.sharpeRatio) * 100) / 100
        : 0;

      walkForwardResults.push({
        foldIndex: f + 1,
        inSampleRange: {
          start: new Date(trainSlice[0].timestamp).toISOString().split('T')[0],
          end: new Date(trainSlice[trainSlice.length - 1].timestamp).toISOString().split('T')[0],
        },
        outOfSampleRange: {
          start: new Date(testSlice[0].timestamp).toISOString().split('T')[0],
          end: new Date(testSlice[testSlice.length - 1].timestamp).toISOString().split('T')[0],
        },
        inSampleSharpe: trainMet.sharpeRatio,
        outOfSampleSharpe: testMet.sharpeRatio,
        degradationRatio,
        outOfSampleReturnPct: testMet.netProfitPct,
        outOfSampleDrawdownPct: testMet.maxDrawdownPct,
      });
    }
  }

  let overfittingRiskAssessment: BacktestRunResult['overfittingRiskAssessment'] = 'LOW';
  if (
    outOfSampleMetrics.sharpeRatio < inSampleMetrics.sharpeRatio * 0.45 ||
    outOfSampleMetrics.winRatePct < inSampleMetrics.winRatePct - 15
  ) {
    overfittingRiskAssessment = 'HIGH_OVERFIT_DETECTED';
  } else if (outOfSampleMetrics.sharpeRatio < inSampleMetrics.sharpeRatio * 0.75) {
    overfittingRiskAssessment = 'MODERATE';
  }

  // Build equity in chronological order and aggregate every trade exit at a
  // timestamp instead of using Array.find(), which could silently drop exits.
  const pnlByExitTimestamp = new Map<number, number>();
  for (const trade of allTrades) {
    pnlByExitTimestamp.set(
      trade.exitTimestamp,
      (pnlByExitTimestamp.get(trade.exitTimestamp) || 0) + trade.netPnL
    );
  }

  let currentEquity = params.initialCapital;
  let peak = currentEquity;
  const equityCurve: BacktestRunResult['equityCurve'] = [];
  const firstClose = bars[0].close;

  for (const bar of bars) {
    currentEquity += pnlByExitTimestamp.get(bar.timestamp) || 0;
    if (currentEquity > peak) peak = currentEquity;
    const drawdownPct = peak > 0 ? ((peak - currentEquity) / peak) * 100 : 0;

    equityCurve.push({
      timestamp: bar.timestamp,
      equity: Math.round(currentEquity * 100) / 100,
      drawdownPct: Math.round(drawdownPct * 100) / 100,
      benchmarkEquity: Math.round((params.initialCapital * (bar.close / firstClose)) * 100) / 100,
    });
  }

  return {
    id: `BT-${Date.now().toString(36).toUpperCase()}`,
    timestamp: Date.now(),
    parameters: params,
    inSampleMetrics,
    outOfSampleMetrics,
    combinedMetrics,
    walkForwardResults,
    equityCurve,
    trades: allTrades,
    overfittingRiskAssessment,
  };
}

function calculateSlippageBps(
  params: BacktestParameters,
  executionPrice: number,
  atr?: number
): number {
  if (params.slippageModel === 'ZERO') return 0;

  const baseBps = Math.max(0, params.slippageBps);
  if (params.slippageModel === 'FIXED_BPS') return baseBps;

  // Square-root impact model: the configured slippageBps is the reference
  // impact at 1% ATR/price volatility. Higher volatility increases impact
  // sub-linearly; lower volatility decreases it. No future bar data is used.
  const volatilityRatio = Number.isFinite(atr) && atr !== undefined && executionPrice > 0
    ? Math.max(0, atr / executionPrice)
    : 0;
  return baseBps * Math.sqrt(volatilityRatio / 0.01);
}

function simulateBars(
  bars: OHLCV[],
  params: BacktestParameters,
  outOfSampleStartTimestamp: number
): BacktestTrade[] {
  if (bars.length < 25) return [];

  const closes = bars.map((b) => b.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(bars, 14);
  const trades: BacktestTrade[] = [];

  let inPosition: {
    entryBarIndex: number;
    entryPrice: number;
    entrySlippagePaid: number;
    quantity: number;
    side: 'BUY';
    stopLoss: number;
    takeProfit: number;
  } | null = null;

  // Signals use bar i only; orders execute at bar i+1 open. This keeps the
  // simulation free of close-to-close look-ahead bias.
  for (let i = 24; i < bars.length - 1; i++) {
    const nextBar = bars[i + 1];

    if (inPosition) {
      let exitPrice = 0;
      let exitReason: BacktestTrade['exitReason'] | null = null;

      if (nextBar.low <= inPosition.stopLoss) {
        exitPrice = inPosition.stopLoss;
        exitReason = 'STOP_LOSS';
      } else if (nextBar.high >= inPosition.takeProfit) {
        exitPrice = inPosition.takeProfit;
        exitReason = 'TAKE_PROFIT';
      } else if (ema20[i] < ema50[i]) {
        exitPrice = nextBar.open;
        exitReason = 'SIGNAL_REVERSAL';
      } else if (i - inPosition.entryBarIndex > 20) {
        exitPrice = nextBar.open;
        exitReason = 'TIME_HORIZON_EXPIRED';
      }

      if (exitReason && exitPrice > 0) {
        const exitSlippageBps = calculateSlippageBps(params, exitPrice, atr[i]);
        const exitSlippagePerUnit = (exitPrice * exitSlippageBps) / 10000;
        const netExitPrice = Math.max(Number.EPSILON, exitPrice - exitSlippagePerUnit);
        const grossPnL = (netExitPrice - inPosition.entryPrice) * inPosition.quantity;
        const turnover = (inPosition.entryPrice + netExitPrice) * inPosition.quantity;
        const feesPaid = turnover * (params.commissionRatePct / 100 + params.taxRatePct / 100);
        const exitSlippagePaid = exitSlippagePerUnit * inPosition.quantity;
        const totalSlippagePaid = inPosition.entrySlippagePaid + exitSlippagePaid;
        const netPnL = grossPnL - feesPaid;
        const isOutOfSample = bars[inPosition.entryBarIndex + 1].timestamp >= outOfSampleStartTimestamp;

        trades.push({
          tradeId: `TR-${trades.length + 1}-${isOutOfSample ? 'OOS' : 'IS'}`,
          symbol: params.symbol,
          entryTimestamp: bars[inPosition.entryBarIndex + 1].timestamp,
          exitTimestamp: nextBar.timestamp,
          entryPrice: inPosition.entryPrice,
          exitPrice: netExitPrice,
          quantity: inPosition.quantity,
          side: inPosition.side,
          grossPnL: Math.round(grossPnL * 100) / 100,
          netPnL: Math.round(netPnL * 100) / 100,
          returnPct: Math.round(((netExitPrice - inPosition.entryPrice) / inPosition.entryPrice) * 10000) / 100,
          slippagePaid: Math.round(totalSlippagePaid * 100) / 100,
          feesPaid: Math.round(feesPaid * 100) / 100,
          exitReason,
          durationBars: i + 1 - inPosition.entryBarIndex,
          isOutOfSample,
        });

        inPosition = null;
      }
      continue;
    }

    const isBull = ema20[i] > ema50[i] && ema20[i - 1] <= ema50[i - 1] && rsi[i] < 65;
    if (!isBull) continue;

    const rawEntry = nextBar.open;
    const entrySlippageBps = calculateSlippageBps(params, rawEntry, atr[i]);
    const entrySlippagePerUnit = (rawEntry * entrySlippageBps) / 10000;
    const executedEntry = rawEntry + entrySlippagePerUnit;
    const currentAtr = atr[i] || rawEntry * 0.015;
    const stopLoss = executedEntry - 1.8 * currentAtr;
    const takeProfit = executedEntry + 3.2 * currentAtr;
    const targetNotional = params.initialCapital * (params.positionSizingPct / 100);
    const quantity = Math.floor(targetNotional / executedEntry);

    // Never fabricate a one-unit trade that exceeds the requested position size.
    if (quantity < 1) continue;

    inPosition = {
      entryBarIndex: i,
      entryPrice: executedEntry,
      entrySlippagePaid: entrySlippagePerUnit * quantity,
      quantity,
      side: 'BUY',
      stopLoss,
      takeProfit,
    };
  }

  // A backtest must account for an open position at the end of its time horizon.
  // Liquidate on the final bar close using the same exit-cost model. This avoids
  // silently dropping unrealized P&L from final equity and closed-trade metrics.
  if (inPosition) {
    const finalBarIndex = bars.length - 1;
    const finalBar = bars[finalBarIndex];
    const exitPrice = finalBar.close;
    if (Number.isFinite(exitPrice) && exitPrice > 0) {
      const exitSlippageBps = calculateSlippageBps(params, exitPrice, atr[finalBarIndex]);
      const exitSlippagePerUnit = (exitPrice * exitSlippageBps) / 10000;
      const netExitPrice = Math.max(Number.EPSILON, exitPrice - exitSlippagePerUnit);
      const grossPnL = (netExitPrice - inPosition.entryPrice) * inPosition.quantity;
      const turnover = (inPosition.entryPrice + netExitPrice) * inPosition.quantity;
      const feesPaid = turnover * (params.commissionRatePct / 100 + params.taxRatePct / 100);
      const exitSlippagePaid = exitSlippagePerUnit * inPosition.quantity;
      const totalSlippagePaid = inPosition.entrySlippagePaid + exitSlippagePaid;
      const netPnL = grossPnL - feesPaid;
      const isOutOfSample = bars[inPosition.entryBarIndex + 1].timestamp >= outOfSampleStartTimestamp;

      trades.push({
        tradeId: `TR-${trades.length + 1}-${isOutOfSample ? 'OOS' : 'IS'}`,
        symbol: params.symbol,
        entryTimestamp: bars[inPosition.entryBarIndex + 1].timestamp,
        exitTimestamp: finalBar.timestamp,
        entryPrice: inPosition.entryPrice,
        exitPrice: netExitPrice,
        quantity: inPosition.quantity,
        side: inPosition.side,
        grossPnL: Math.round(grossPnL * 100) / 100,
        netPnL: Math.round(netPnL * 100) / 100,
        returnPct: Math.round(((netExitPrice - inPosition.entryPrice) / inPosition.entryPrice) * 10000) / 100,
        slippagePaid: Math.round(totalSlippagePaid * 100) / 100,
        feesPaid: Math.round(feesPaid * 100) / 100,
        exitReason: 'TIME_HORIZON_EXPIRED',
        durationBars: finalBarIndex - inPosition.entryBarIndex,
        isOutOfSample,
      });
    }
  }

  return trades;
}

function calculateQuantitativeMetrics(
  trades: BacktestTrade[],
  initialCapital: number,
  bars: OHLCV[]
): QuantitativeMetrics {
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.netPnL > 0);
  const losingTrades = trades.filter((t) => t.netPnL <= 0);

  const winRatePct = totalTrades > 0 ? Math.round((winningTrades.length / totalTrades) * 1000) / 10 : 0;
  const grossGains = winningTrades.reduce((acc, t) => acc + t.netPnL, 0);
  const grossLosses = Math.abs(losingTrades.reduce((acc, t) => acc + t.netPnL, 0));
  const profitFactor = grossLosses > 0 ? Math.round((grossGains / grossLosses) * 100) / 100 : grossGains > 0 ? 99.9 : 0;

  const netProfit = Math.round(trades.reduce((acc, t) => acc + t.netPnL, 0) * 100) / 100;
  const netProfitPct = Math.round((netProfit / initialCapital) * 10000) / 100;

  let maxStreak = 0;
  let currentStreak = 0;
  for (const trade of trades) {
    if (trade.netPnL <= 0) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  const returns = trades.map((t) => t.netPnL / initialCapital);
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const downsideReturns = returns.filter((r) => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
    : 0;
  const downsideDev = Math.sqrt(downsideVariance);
  const annualFactor = Math.sqrt(250);
  const sharpeRatio = stdDev > 0 ? Math.round(((meanReturn / stdDev) * annualFactor) * 100) / 100 : 0;
  const sortinoRatio = downsideDev > 0 ? Math.round(((meanReturn / downsideDev) * annualFactor) * 100) / 100 : 0;

  let peak = initialCapital;
  let currentCap = initialCapital;
  let maxDrawdownPct = 0;
  let maxDrawdownDurationMs = 0;
  let peakTimestamp = bars[0]?.timestamp ?? 0;
  let drawdownStartTimestamp: number | null = null;
  const exitPnlByTimestamp = new Map<number, number>();
  for (const trade of trades) {
    exitPnlByTimestamp.set(
      trade.exitTimestamp,
      (exitPnlByTimestamp.get(trade.exitTimestamp) || 0) + trade.netPnL
    );
  }

  for (const bar of bars) {
    currentCap += exitPnlByTimestamp.get(bar.timestamp) || 0;
    if (currentCap > peak) {
      peak = currentCap;
      peakTimestamp = bar.timestamp;
      if (drawdownStartTimestamp !== null) {
        maxDrawdownDurationMs = Math.max(
          maxDrawdownDurationMs,
          bar.timestamp - drawdownStartTimestamp
        );
        drawdownStartTimestamp = null;
      }
    } else if (currentCap < peak) {
      if (drawdownStartTimestamp === null) drawdownStartTimestamp = peakTimestamp;
      const drawdownPct = peak > 0 ? ((peak - currentCap) / peak) * 100 : 0;
      maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
      if (drawdownStartTimestamp !== null) {
        maxDrawdownDurationMs = Math.max(
          maxDrawdownDurationMs,
          bar.timestamp - drawdownStartTimestamp
        );
      }
    }
  }

  const years = bars.length > 1
    ? Math.max(0.2, (bars[bars.length - 1].timestamp - bars[0].timestamp) / (365.25 * 24 * 3600 * 1000))
    : 0.2;
  const finalEquity = initialCapital + netProfit;
  const cagrPct = finalEquity > 0
    ? Math.round(((Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100) * 100) / 100
    : 0;
  const calmarRatio = maxDrawdownPct > 0 ? Math.round((cagrPct / maxDrawdownPct) * 100) / 100 : 0;

  const avgWin = winningTrades.length > 0 ? Math.round((grossGains / winningTrades.length) * 100) / 100 : 0;
  const avgLoss = losingTrades.length > 0 ? Math.round((grossLosses / losingTrades.length) * 100) / 100 : 0;
  const winLossRatio = avgLoss > 0 ? Math.round((avgWin / avgLoss) * 100) / 100 : avgWin > 0 ? 10 : 1;
  const totalExposureBars = trades.reduce((sum, t) => sum + t.durationBars, 0);
  const marketExposurePct = bars.length > 0 ? Math.round((totalExposureBars / bars.length) * 1000) / 10 : 0;
  const totalFeesPaid = Math.round(trades.reduce((sum, t) => sum + t.feesPaid, 0) * 100) / 100;
  const totalSlippageCost = Math.round(trades.reduce((sum, t) => sum + t.slippagePaid, 0) * 100) / 100;
  const isUnderSampled = totalTrades < 30;

  return {
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRatePct,
    profitFactor,
    netProfit,
    netProfitPct,
    cagrPct,
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
    maxDrawdownDurationDays: Math.round((maxDrawdownDurationMs / (24 * 3600 * 1000)) * 100) / 100,
    averageWin: avgWin,
    averageLoss: avgLoss,
    winLossRatio,
    maxLosingStreak: maxStreak,
    marketExposurePct,
    totalFeesPaid,
    totalSlippageCost,
    sampleSizeWarning: {
      isUnderSampled,
      warningMessage: isUnderSampled
        ? `Statistical Warning: Sample size (${totalTrades} trades) is below the minimum recommended sample (N >= 30). Metrics may suffer from small-sample variance and high p-value uncertainty.`
        : null,
      recommendedMinTrades: 30,
    },
  };
}
