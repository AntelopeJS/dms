import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from "vue";

/** Custom property a `Grid` / `GridRow` exposes to its cells. */
export const GRID_TRACKS_VAR = "--dms-grid-tracks";

/** What the `gridColumnsTemplate` of the element was built from. */
export interface GridTrackSource {
  maxColumns: number;
  minColumnWidth: string;
}

const SINGLE_TRACK = 1;
// Absorbs sub-pixel rounding, so a container exactly N tracks wide counts N.
const ROUNDING_SLACK = 0.5;

/** A CSS length (`240px`, `15rem`, `30%`) resolved against `parent`, in px. */
function resolveLength(parent: HTMLElement, length: string): number {
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;height:0;width:${length}`;
  parent.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

/**
 * How many explicit column tracks a grid element holds at its current width.
 *
 * The `auto-fill` template (see `gridColumnsTemplate`) drops tracks as the
 * container narrows, but a cell spanning more tracks than are left
 * (`grid-column: span 3` on a phone) would add implicit columns and push the
 * row past the screen. The grid publishes this count as `--dms-grid-tracks`,
 * and a spanned cell clamps its span to it
 * (`span min(3, var(--dms-grid-tracks, 3))`, see RecursiveComponent).
 *
 * The count is worked out from the template's own maths rather than read back
 * from the computed track list, which also lists those implicit columns.
 * Undefined until mounted (the server render keeps the plain span), then kept
 * current by a ResizeObserver and whenever the source changes.
 */
export function useGridTrackCount(
  element: Ref<HTMLElement | null>,
  source: () => GridTrackSource,
): Ref<number | undefined> {
  const trackCount = ref<number>();
  let observer: ResizeObserver | undefined;

  function measure(): void {
    const el = element.value;
    if (!el) return;
    const style = getComputedStyle(el);
    const width =
      el.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const gap = parseFloat(style.columnGap) || 0;
    const { maxColumns, minColumnWidth } = source();
    const columns = Math.max(maxColumns, SINGLE_TRACK);
    const share = (width - (columns - SINGLE_TRACK) * gap) / columns;
    const floor = Math.min(
      width,
      Math.max(resolveLength(el, minColumnWidth), share),
    );
    trackCount.value =
      floor > 0
        ? Math.max(
            SINGLE_TRACK,
            Math.floor((width + gap + ROUNDING_SLACK) / (floor + gap)),
          )
        : undefined;
  }

  watch(source, () => nextTick(measure), { deep: true });

  onMounted(() => {
    measure();
    if (typeof ResizeObserver === "undefined" || !element.value) return;
    observer = new ResizeObserver(measure);
    observer.observe(element.value);
  });
  onBeforeUnmount(() => observer?.disconnect());

  return trackCount;
}
