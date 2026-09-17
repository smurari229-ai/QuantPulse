import { OHLCV } from '../types/market';
import { BacktestParameters, BacktestRunResult } from '../types/backtest';
import { runFullBacktest as runCoreBacktest } from './backtestingLabCore';

/**
 * Public backtest entry point.
 *
 * The existing simulation remains intact in backtestingLabCore. This thin
 * validation layer enforces the parameters exposed by the Backtesting Lab:
 * the currently implemented strategy and the requested date range.
 */
export function runFullBacktest(
  bars: OHLCV[],
  params: BacktestParameters
): BacktestRunResult {
  if (params.strategyId !== 'TF_EMA_CROSS') {
    throw new Error(
      `Strategy ${params.strategyId} is not implemented by the current backtest engine. Select TF_EMA_CROSS.`
    );
  }

  const start = parseDateBoundary(params.startDate);
  const endStart = parseDateBoundary(params.endDate);
  if (start === null || endStart === null) {
    throw new Error('Backtest startDate and endDate must use YYYY-MM-DD format.');
  }

  const endExclusive = endStart + 24 * 60 * 60 * 1000;
  if (start >= endExclusive) {
    throw new Error('Backtest startDate must be before endDate.');
  }

  const scopedBars = bars.filter(
    (bar) => Number.isFinite(bar.timestamp) && bar.timestamp >= start && bar.timestamp < endExclusive
  );

  if (scopedBars.length === 0) {
    throw new Error('No market bars fall inside the selected backtest date range.');
  }

  return runCoreBacktest(scopedBars, params);
}

function parseDateBoundary(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}
