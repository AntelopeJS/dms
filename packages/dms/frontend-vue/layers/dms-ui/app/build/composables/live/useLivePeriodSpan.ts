import { onScopeDispose, watch } from "vue";
import { currentPageLive } from "./currentPageLive";

/** The range a period selector shows. */
interface ShownRange {
  from: Date;
  to: Date;
}

/**
 * Tells the live page on screen how long a period the selector shows, so a
 * page declaring `live.slowRateAfter` slows down over a long one. Follows
 * the page's controller as it is installed or replaced, and withdraws the
 * span when the selector goes.
 *
 * @internal
 */
export function useLivePeriodSpan(range: () => ShownRange): void {
  if (typeof window === "undefined") return;
  const owner = Symbol("live-period");
  const stop = watch(
    [currentPageLive, () => range().to.getTime() - range().from.getTime()],
    ([controller, span], _previous, onCleanup) => {
      controller?.reportPeriodSpan(owner, span);
      onCleanup(() => controller?.reportPeriodSpan(owner, null));
    },
    { immediate: true },
  );
  onScopeDispose(stop);
}
