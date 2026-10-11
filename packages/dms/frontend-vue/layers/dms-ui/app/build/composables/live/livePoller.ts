import { readonly, ref, type Ref } from "vue";

/**
 * Reads the page's blocks on a clock while the realtime stream is down: the
 * fallback of a live page with a cadence. Each tick asks the interval again,
 * so a period changed meanwhile applies from the next one.
 *
 * @internal
 */
export class LivePoller {
  private readonly active = ref(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** The poller is running: the stream is down and the page reads by itself. */
  readonly isPolling: Readonly<Ref<boolean>> = readonly(this.active);

  constructor(
    private readonly intervalMs: () => number,
    private readonly poll: () => void,
  ) {}

  /** Runs while `shouldRun` holds and the page has a cadence; stops else. */
  update(shouldRun: boolean): void {
    const isRunning = shouldRun && this.intervalMs() > 0;
    if (isRunning === this.active.value) return;
    this.active.value = isRunning;
    if (isRunning) this.schedule();
    else this.stop();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.active.value = false;
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.poll();
      if (this.active.value) this.schedule();
    }, this.intervalMs());
  }
}
