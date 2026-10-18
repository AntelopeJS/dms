import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

const FIRST_ROW_SELECTOR = "tbody tr";
const SCROLLABLE_OVERFLOW = /(auto|scroll)/;

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      SCROLLABLE_OVERFLOW.test(overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return null;
}

/**
 * Whether the first row of the table in `element` is out of view above the
 * area it scrolls in (its scrolling parent, else the window).
 *
 * @internal
 */
export function isFirstRowScrolledPast(element: HTMLElement): boolean {
  const row = element.querySelector(FIRST_ROW_SELECTOR) ?? element;
  const scroller = scrollParent(element);
  const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
  return row.getBoundingClientRect().bottom <= viewTop;
}

/**
 * Whether the table in `element` is on screen or above it: its top stands
 * above the bottom of the area it scrolls in (its scrolling parent, else the
 * window). Rows added to such a table move rows the user can see, or did.
 *
 * @internal
 */
export function isTableReached(element: HTMLElement): boolean {
  const scroller = scrollParent(element);
  const viewBottom = scroller
    ? scroller.getBoundingClientRect().bottom
    : window.innerHeight;
  return element.getBoundingClientRect().top < viewBottom;
}

/**
 * Follows whether the user scrolled the table's first row out of view, on
 * any scroll of the page (read once per frame). Inert when `isEnabled` is
 * false, and on the server.
 *
 * @internal
 */
export function useScrolledPastTop(
  element: () => HTMLElement | null,
  isEnabled: boolean,
): Ref<boolean> {
  return useScrollMeasure(element, isEnabled, isFirstRowScrolledPast);
}

/**
 * Follows whether the table is on screen or scrolled past (`isTableReached`),
 * like `useScrolledPastTop`.
 *
 * @internal
 */
export function useTableReached(
  element: () => HTMLElement | null,
  isEnabled: boolean,
): Ref<boolean> {
  return useScrollMeasure(element, isEnabled, isTableReached);
}

function useScrollMeasure(
  element: () => HTMLElement | null,
  isEnabled: boolean,
  test: (element: HTMLElement) => boolean,
): Ref<boolean> {
  const isMatching = ref(false);
  if (!isEnabled || typeof window === "undefined") return isMatching;
  let frame: number | null = null;
  const measure = () => {
    frame = null;
    const target = element();
    isMatching.value = !!target && test(target);
  };
  const onScroll = () => {
    frame ??= requestAnimationFrame(measure);
  };
  onMounted(() => {
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    measure();
  });
  onBeforeUnmount(() => {
    window.removeEventListener("scroll", onScroll, { capture: true });
    if (frame !== null) cancelAnimationFrame(frame);
  });
  return isMatching;
}
