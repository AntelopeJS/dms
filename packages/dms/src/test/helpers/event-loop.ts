import { monitorEventLoopDelay } from "node:perf_hooks";
import { expect } from "chai";

const NANOSECONDS_PER_MILLISECOND = 1e6;
const RESOLUTION_MS = 5;

/**
 * Longest the event loop may stall while a password is written. One scrypt
 * run on the event loop blocks it for more than twice this.
 */
const MAX_LOOP_STALL_MS = 60;

/** Runs `work` and returns the longest stall of the event loop meanwhile. */
export async function loopStallDuring<T>(
  work: () => Promise<T>,
): Promise<{ result: T; stallMs: number }> {
  const histogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  histogram.enable();
  try {
    const result = await work();
    return { result, stallMs: histogram.max / NANOSECONDS_PER_MILLISECOND };
  } finally {
    histogram.disable();
  }
}

/** Fails when the event loop stalled as long as one scrypt run. */
export function expectNoStall(stallMs: number): void {
  expect(stallMs, "longest event-loop stall in ms").to.be.below(
    MAX_LOOP_STALL_MS,
  );
}
