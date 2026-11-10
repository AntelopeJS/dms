import { expect } from "chai";

const TICK_MS = 1;

/**
 * Longest the event loop may stall while a password is written. One scrypt
 * run on the event loop blocks it for more than twice this.
 */
const MAX_LOOP_STALL_MS = 60;

/**
 * Runs `work` and returns the longest gap between two ticks of a 1 ms
 * interval meanwhile: how long the event loop stalled at most.
 */
export async function loopStallDuring<T>(
  work: () => Promise<T>,
): Promise<{ result: T; stallMs: number }> {
  let last = performance.now();
  let stallMs = 0;
  const ticker = setInterval(() => {
    const now = performance.now();
    stallMs = Math.max(stallMs, now - last);
    last = now;
  }, TICK_MS);
  try {
    const result = await work();
    stallMs = Math.max(stallMs, performance.now() - last);
    return { result, stallMs };
  } finally {
    clearInterval(ticker);
  }
}

/** Fails when the event loop stalled as long as one scrypt run. */
export function expectNoStall(stallMs: number): void {
  expect(stallMs, "longest event-loop stall in ms").to.be.below(
    MAX_LOOP_STALL_MS,
  );
}
