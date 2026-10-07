/**
 * Counts failures per key over a fixed window and refuses a key once it
 * reached its limit, until its window ends. In memory and per process, like
 * the other throttles of the auth routes: a deployment of several instances
 * multiplies each budget by their number.
 */
export class AttemptLimiter {
  private readonly windows = new Map<string, AttemptWindow>();

  /**
   * @param limit Failures a key may collect within one window
   * @param windowMs Length of the window, from the key's first failure
   * @param maxKeys Keys kept at most; the oldest windows go first beyond it
   */
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys: number,
  ) {}

  /** Whether `key` used up its failures for the current window. */
  isBlocked(key: string, now: number): boolean {
    const window = this.liveWindow(key, now);
    return window !== undefined && window.failures >= this.limit;
  }

  recordFailure(key: string, now: number): void {
    const window = this.liveWindow(key, now);
    if (window) {
      window.failures += 1;
      return;
    }
    this.windows.set(key, { startedAt: now, failures: 1 });
    this.evictBeyondCapacity();
  }

  /** Forgets the failures of `key`, once it proved itself. */
  reset(key: string): void {
    this.windows.delete(key);
  }

  private liveWindow(key: string, now: number): AttemptWindow | undefined {
    const window = this.windows.get(key);
    if (!window) return undefined;
    if (now - window.startedAt < this.windowMs) return window;
    this.windows.delete(key);
    return undefined;
  }

  // A Map iterates in insertion order, so the first keys hold the oldest
  // windows.
  private evictBeyondCapacity(): void {
    for (const key of this.windows.keys()) {
      if (this.windows.size <= this.maxKeys) return;
      this.windows.delete(key);
    }
  }
}

interface AttemptWindow {
  startedAt: number;
  failures: number;
}
