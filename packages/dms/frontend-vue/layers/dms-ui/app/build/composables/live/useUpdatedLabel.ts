import {
  type ComputedRef,
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";
import { formatElapsed } from "./formatElapsed";

const TICK_MS = 1000;

/**
 * "Updated 12 s ago" from the instant `at` gives (ms since the epoch), counted
 * every second once mounted; empty while `at` is `null`. The clock is the
 * browser's: render the label once mounted only.
 *
 * @internal
 */
export function useUpdatedLabel(
  at: () => number | null,
  shouldTick = true,
): ComputedRef<string> {
  const { t } = useI18n();
  const now = ref(Date.now());
  let ticker: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    now.value = Date.now();
    if (shouldTick)
      ticker = setInterval(() => (now.value = Date.now()), TICK_MS);
  });
  onBeforeUnmount(() => clearInterval(ticker));
  return computed(() => {
    const instant = at();
    if (instant === null) return "";
    const { unit, count } = formatElapsed(now.value - instant);
    return t(`dms.live.updated_${unit}`, { count }, count);
  });
}
