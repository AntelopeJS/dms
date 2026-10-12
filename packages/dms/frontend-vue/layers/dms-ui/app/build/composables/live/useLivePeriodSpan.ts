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
 * span when the selector goes. A range without bounds (all time) spans more
 * than any period.
 *
 * @internal
 */
export function useLivePeriodSpan(range: () => ShownRange | null): void {
  if (typeof window === "undefined") return;
  const owner = Symbol("live-period");
  const spanOf = (shown: ShownRange | null) =>
    shown ? shown.to.getTime() - shown.from.getTime() : Number.POSITIVE_INFINITY;
  const stop = watch(
    [currentPageLive, () => spanOf(range())],
    ([controller, span], _previous, onCleanup) => {
      controller?.reportPeriodSpan(owner, span);
      onCleanup(() => controller?.reportPeriodSpan(owner, null));
    },
    { immediate: true },
  );
  onScopeDispose(stop);
}
