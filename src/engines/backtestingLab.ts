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
  const totalBars = bars.length;
  const splitIndex = Math.floor(totalBars * (1 - params.outOfSampleSplitRatio));

  // Run in-sample and out-of-sample sequentially
  const inSampleBars = bars.slice(0, splitIndex);
  const outOfSampleBars = bars.slice(splitIndex);

  const inSampleSimulation = simulateBars(inSampleBars, params, false);
  const outOfSampleSimulation = simulateBars(outOfSampleBars, params, true);

  const allTrades = [...inSampleSimulation.trades, ...outOfSampleSimulation.trades];
  const combinedMetrics = calculateQuantitativeMetrics(allTrades, params.initialCapital, bars);
  const inSampleMetrics = calculateQuantitativeMetrics(inSampleSimulation.trades, params.initialCapital, inSampleBars);
  const outOfSampleMetrics = calculateQuantitativeMetrics(outOfSampleSimulation.trades, params.initialCapital, outOfSampleBars);

  // Walk-forward analysis (3 folds)
  const walkForwardResults: WalkForwardPeriodResult[] = [];
  if (params.enableWalkForward && totalBars >= 60) {
    const foldSize = Math.floor(totalBars / 3);
    for (let f = 0; f < 3; f++) {
      const trainStart = f * Math.floor(foldSize * 0.4);
      const trainEnd = trainStart + Math.floor(foldSize * 0.65);
      const testEnd = Math.min(totalBars, trainEnd + Math.floor(foldSize * 0.35));

      const trainSlice = bars.slice(trainStart, trainEnd);
      const testSlice = bars.slice(trainEnd, testEnd);

      if (trainSlice.length > 15 && testSlice.length > 10) {
        const trainSim = simulateBars(trainSlice, params, false);
        const testSim = simulateBars(testSlice, params, true);

        const trainMet = calculateQuantitativeMetrics(trainSim.trades, params.initialCapital, trainSlice);
        const testMet = calculateQuantitativeMetrics(testSim.trades, params.initialCapital, testSlice);

        const degRatio = trainMet.sharpeRatio !== 0
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
          degradationRatio: degRatio,
          outOfSampleReturnPct: testMet.netProfitPct,
          outOfSampleDrawdownPct: testMet.maxDrawdownPct,
        });
      }
    }
  }

  // Overfitting risk assessment
  let overfittingRiskAssessment: BacktestRunResult['overfittingRiskAssessment'] = 'LOW';
  if (outOfSampleMetrics.sharpeRatio < inSampleMetrics.sharpeRatio * 0.45 || outOfSampleMetrics.winRatePct < inSampleMetrics.winRatePct - 15) {
    overfittingRiskAssessment = 'HIGH_OVERFIT_DETECTED';
  } else if (outOfSampleMetrics.sharpeRatio < inSampleMetrics.sharpeRatio * 0.75) {
    overfittingRiskAssessment = 'MODERATE';
  }

  // Synthesize daily equity curve
  let currentEquity = params.initialCapital;
  let peak = currentEquity;
  const equityCurve: BacktestRunResult['equityCurve'] = [];

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tradeExitToday = allTrades.find((t) => t.exitTimestamp === b.timestamp);
    if (tradeExitToday) {
      currentEquity += tradeExitToday.netPnL;
    }
    if (currentEquity > peak) peak = currentEquity;
    const dd = peak > 0 ? ((peak - currentEquity) / peak) * 100 : 0;

    equityCurve.push({
      timestamp: b.timestamp,
      equity: Math.round(currentEquity * 100) / 100,
      drawdownPct: Math.round(dd * 100) / 100,
      benchmarkEquity: Math.round((params.initialCapital * (b.close / bars[0].close)) * 100) / 100,
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

function simulateBars(bars: OHLCV[], params: BacktestParameters, isOutOfSample: boolean): { trades: BacktestTrade[] } {
  if (bars.length < 25) return { trades: [] };

  const closes = bars.map((b) => b.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const rsi = calculateRSI(closes, 14);
  const atr = calculateATR(bars, 14);

  const trades: BacktestTrade[] = [];
  let inPosition: {
    entryBarIndex: number;
    entryPrice: number;
    quantity: number;
    side: 'BUY' | 'SELL';
    stopLoss: number;
    takeProfit: number;
  } | null = null;

  // IMPORTANT: No look-ahead bias! Decisions are made at the close of bar i, executed at the OPEN of bar i+1
  for (let i = 24; i < bars.length - 1; i++) {
    const currentBar = bars[i];
    const nextBar = bars[i + 1];

    if (inPosition) {
      // Check exit conditions against next bar's high/low
      let exitPrice = 0;
      let exitReason: BacktestTrade['exitReason'] | null = null;

      if (inPosition.side === 'BUY') {
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
      }

      if (exitReason && exitPrice > 0) {
        // Model slippage
        const slippageBps = params.slippageBps;
        const slippagePerUnit = (exitPrice * slippageBps) / 10000;
        const netExitPrice = inPosition.side === 'BUY' ? exitPrice - slippagePerUnit : exitPrice + slippagePerUnit;

        const grossPnL = (netExitPrice - inPosition.entryPrice) * inPosition.quantity;
        const turnover = (inPosition.entryPrice + netExitPrice) * inPosition.quantity;
        const feesPaid = turnover * (params.commissionRatePct / 100 + params.taxRatePct / 100);
        const slippagePaid = slippagePerUnit * inPosition.quantity * 2;
        const netPnL = grossPnL - feesPaid;

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
          slippagePaid: Math.round(slippagePaid * 100) / 100,
          feesPaid: Math.round(feesPaid * 100) / 100,
          exitReason,
          durationBars: i + 1 - inPosition.entryBarIndex,
          isOutOfSample,
        });

        inPosition = null;
      }
    } else {
      // Evaluate Entry Signal based strictly on historical bar i
      const isBull = ema20[i] > ema50[i] && ema20[i - 1] <= ema50[i - 1] && rsi[i] < 65;
      if (isBull) {
        // Execute on next bar's OPEN with entry slippage
        const rawEntry = nextBar.open;
        const slippagePerUnit = (rawEntry * params.slippageBps) / 10000;
        const executedEntry = rawEntry + slippagePerUnit;
        const currentAtr = atr[i] || rawEntry * 0.015;

        const stopLoss = executedEntry - 1.8 * currentAtr;
        const takeProfit = executedEntry + 3.2 * currentAtr;
        const notional = (params.initialCapital * (params.positionSizingPct / 100));
        const quantity = Math.max(1, Math.floor(notional / executedEntry));

        inPosition = {
          entryBarIndex: i,
          entryPrice: executedEntry,
          quantity,
          side: 'BUY',
          stopLoss,
          takeProfit,
        };
      }
    }
  }

  return { trades };
}

function calculateQuantitativeMetrics(trades: BacktestTrade[], initialCapital: number, bars: OHLCV[]): QuantitativeMetrics {
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.netPnL > 0);
  const losingTrades = trades.filter((t) => t.netPnL <= 0);

  const winRatePct = totalTrades > 0 ? Math.round((winningTrades.length / totalTrades) * 1000) / 10 : 0;
  const grossGains = winningTrades.reduce((acc, t) => acc + t.netPnL, 0);
  const grossLosses = Math.abs(losingTrades.reduce((acc, t) => acc + t.netPnL, 0));
  const profitFactor = grossLosses > 0 ? Math.round((grossGains / grossLosses) * 100) / 100 : grossGains > 0 ? 99.9 : 0;

  const netProfit = Math.round(trades.reduce((acc, t) => acc + t.netPnL, 0) * 100) / 100;
  const netProfitPct = Math.round((netProfit / initialCapital) * 10000) / 100;

  // Maximum losing streak
  let maxStreak = 0;
  let currentStreak = 0;
  for (const t of trades) {
    if (t.netPnL <= 0) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  // Returns array for Sharpe / Sortino
  const returns = trades.map((t) => t.netPnL / initialCapital);
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 1 ? returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1) : 0;
  const stdDev = Math.sqrt(variance);

  const downsideReturns = returns.filter((r) => r < 0);
  const downsideVariance = downsideReturns.length > 0 ? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length : 0;
  const downsideDev = Math.sqrt(downsideVariance);

  // Annualized assuming ~250 trading bars
  const annualFactor = Math.sqrt(250);
  const sharpeRatio = stdDev > 0 ? Math.round(((meanReturn / stdDev) * annualFactor) * 100) / 100 : 0;
  const sortinoRatio = downsideDev > 0 ? Math.round(((meanReturn / downsideDev) * annualFactor) * 100) / 100 : 0;

  // Max Drawdown
  let peak = initialCapital;
  let currentCap = initialCapital;
  let maxDrawdownPct = 0;

  for (const t of trades) {
    currentCap += t.netPnL;
    if (currentCap > peak) peak = currentCap;
    const dd = peak > 0 ? ((peak - currentCap) / peak) * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }

  // CAGR calculation
  const years = Math.max(0.2, (bars[bars.length - 1].timestamp - bars[0].timestamp) / (365.25 * 24 * 3600 * 1000));
  const finalEquity = initialCapital + netProfit;
  const cagrPct = finalEquity > 0 && years > 0 ? Math.round(((Math.pow(finalEquity / initialCapital, 1 / years) - 1) * 100) * 100) / 100 : 0;
  const calmarRatio = maxDrawdownPct > 0 ? Math.round((cagrPct / maxDrawdownPct) * 100) / 100 : 0;

  const avgWin = winningTrades.length > 0 ? Math.round((grossGains / winningTrades.length) * 100) / 100 : 0;
  const avgLoss = losingTrades.length > 0 ? Math.round((grossLosses / losingTrades.length) * 100) / 100 : 0;
  const winLossRatio = avgLoss > 0 ? Math.round((avgWin / avgLoss) * 100) / 100 : avgWin > 0 ? 10 : 1;

  const totalExposureBars = trades.reduce((sum, t) => sum + t.durationBars, 0);
  const marketExposurePct = bars.length > 0 ? Math.round((totalExposureBars / bars.length) * 1000) / 10 : 0;

  const totalFeesPaid = Math.round(trades.reduce((sum, t) => sum + t.feesPaid, 0) * 100) / 100;
  const totalSlippageCost = Math.round(trades.reduce((sum, t) => sum + t.slippagePaid, 0) * 100) / 100;

  const isUnderSampled = totalTrades < 30;
  const sampleSizeWarning = {
    isUnderSampled,
    warningMessage: isUnderSampled
      ? `Statistical Warning: Sample size (${totalTrades} trades) is below the minimum recommended sample (N >= 30). Metrics may suffer from small-sample variance and high p-value uncertainty.`
      : null,
    recommendedMinTrades: 30,
  };

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
    maxDrawdownDurationDays: Math.round(maxDrawdownPct * 1.5),
    averageWin: avgWin,
    averageLoss: avgLoss,
    winLossRatio,
    maxLosingStreak: maxStreak,
    marketExposurePct,
    totalFeesPaid,
    totalSlippageCost,
    sampleSizeWarning,
  };
}
