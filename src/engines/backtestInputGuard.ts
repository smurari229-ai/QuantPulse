import { OHLCV } from '../types/market';
import { BacktestParameters, BacktestRunResult } from '../types/backtest';
import { runFullBacktest } from './backtestingLab';

/**
 * BacktestingLab currently implements only the EMA-cross simulation logic.
 * Keep the public UI truthful and enforce the requested date window before
 * handing data to the existing engine. This wrapper intentionally does not
 * alter the established backtest engine.
 */
export function runDateScopedBacktest(
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

  const scopedBars = bars
    .filter((bar) => Number.isFinite(bar.timestamp) && Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close) && Number.isFinite(bar.volume))
    .filter((bar) => bar.timestamp >= start && bar.timestamp < endExclusive)
    .sort((a, b) => a.timestamp - b.timestamp);

  if (scopedBars.length === 0) {
    throw new Error('No market bars fall inside the selected backtest date range.');
  }

  return runFullBacktest(scopedBars, params);
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
