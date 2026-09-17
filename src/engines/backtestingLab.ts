import { OHLCV } from '../types/market';
import { BacktestParameters, BacktestRunResult } from '../types/backtest';
import { runFullBacktest as runCoreBacktest } from './backtestingLabCore';

/**
 * Public backtest entry point.
 *
 * The established simulation remains intact in backtestingLabCore. This thin
 * validation layer enforces the date range exposed by BacktestParameters while
 * preserving the existing strategy behavior until each registered strategy has
 * its own backtest simulation implementation.
 */
export function runFullBacktest(
  bars: OHLCV[],
  params: BacktestParameters
): BacktestRunResult {
  const start = parseDateBoundary(params.startDate);
  const endStart = parseDateBoundary(params.endDate);
  if (start === null || endStart === null) {
    throw new Error('Backtest startDate and endDate must use YYYY-MM-DD or ISO date format.');
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const date = new Date(timestamp);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? timestamp
      : null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime())
    ? Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    : null;
}
