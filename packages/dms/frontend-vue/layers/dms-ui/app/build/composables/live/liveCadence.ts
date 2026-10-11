import type { PageLiveOptions, PageLivePeriod } from "../../../types/live";

const MS_PER_SECOND = 1000;
const MS_PER_UNIT: Record<string, number> = {
  m: 60 * MS_PER_SECOND,
  h: 60 * 60 * MS_PER_SECOND,
  d: 24 * 60 * 60 * MS_PER_SECOND,
};
const PERIOD_PATTERN = /^(\d+)([mhd])$/;

/**
 * The length of a `slowRateAfter.period` in ms, `null` when it does not read
 * like `"30m"`, `"24h"` or `"7d"`.
 *
 * @internal
 */
export function livePeriodMs(period: PageLivePeriod | string): number | null {
  const match = PERIOD_PATTERN.exec(period);
  if (!match) return null;
  const [, amount, unit] = match;
  return Number(amount) * (MS_PER_UNIT[unit!] ?? 0) || null;
}

/**
 * The shortest interval between two reads of one block, in ms, for a page
 * showing a period spanning `periodSpanMs` (`null` without a period): the
 * slower `slowRateAfter` once the span reaches its period, `maxRate` else,
 * 0 for no cap.
 *
 * @internal
 */
export function liveIntervalMs(
  options: PageLiveOptions,
  periodSpanMs: number | null,
): number {
  const slow = options.slowRateAfter;
  const slowFrom = slow ? livePeriodMs(slow.period) : null;
  if (slow && slowFrom !== null && periodSpanMs !== null) {
    if (periodSpanMs >= slowFrom) return slow.maxRate * MS_PER_SECOND;
  }
  return (options.maxRate ?? 0) * MS_PER_SECOND;
}
