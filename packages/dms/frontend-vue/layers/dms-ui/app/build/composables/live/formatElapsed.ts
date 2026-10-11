const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** The unit an elapsed time reads in: seconds, then minutes, then hours. */
export type ElapsedUnit = "seconds" | "minutes" | "hours";

export interface Elapsed {
  unit: ElapsedUnit;
  count: number;
}

/**
 * A duration as "N s", "N min" or "N h": the largest unit it fills once,
 * rounded down. A negative duration (a clock set back) reads as 0 s.
 *
 * @internal
 */
export function formatElapsed(elapsedMs: number): Elapsed {
  const seconds = Math.max(0, Math.floor(elapsedMs / MS_PER_SECOND));
  if (seconds < SECONDS_PER_MINUTE) return { unit: "seconds", count: seconds };
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return { unit: "minutes", count: minutes };
  return { unit: "hours", count: Math.floor(minutes / MINUTES_PER_HOUR) };
}
