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
  private readonly hasPolled = ref(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * The page reads by itself: the stream stayed down for a whole interval and
   * the first poll ran. Not while a page's stream is still connecting (every
   * full load starts "down" until it opens), which would flash the polling
   * hint for a frame.
   */
  readonly isPolling: Readonly<Ref<boolean>> = readonly(this.hasPolled);

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
    this.hasPolled.value = false;
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.hasPolled.value = true;
      this.poll();
      if (this.active.value) this.schedule();
    }, this.intervalMs());
  }
}
