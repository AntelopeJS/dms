import { onBeforeUnmount, onMounted, watch } from "vue";

/**
 * The CSS variable the toaster's bottom offset adds (theme/surfaces.ts): how
 * far above the viewport's bottom edge a bar anchored there reaches.
 */
export const TOASTER_CLEARANCE_VAR = "--dms-toaster-clearance";

/**
 * How close to the viewport's bottom edge a bar has to end to count as
 * anchored there: the floating save bar floats 16px off it. A bar that ends
 * higher (a short form's bar, a card's footer band mid-page) leaves the
 * toaster's corner free.
 */
const BOTTOM_EDGE_REACH = 48;

/** The part of a bar's bounding box the clearance reads. */
export interface BarBox {
  top: number;
  bottom: number;
  height: number;
}

/**
 * The room the toaster leaves above the bars anchored to the bottom of a
 * viewport `viewportHeight` tall: the distance from that edge to the highest
 * such bar's top, 0 when none is.
 */
export function toasterClearance(
  boxes: BarBox[],
  viewportHeight: number,
): number {
  let clearance = 0;
  for (const box of boxes) {
    const isAnchored =
      box.height > 0 &&
      box.top < viewportHeight &&
      box.bottom >= viewportHeight - BOTTOM_EDGE_REACH;
    if (isAnchored)
      clearance = Math.max(clearance, Math.ceil(viewportHeight - box.top));
  }
  return clearance;
}

type BarElement = () => HTMLElement | null | undefined;

const shownBars = new Map<symbol, BarElement>();
let frame = 0;

function applyClearance(): void {
  frame = 0;
  const boxes = [...shownBars.values()]
    .map((element) => element()?.getBoundingClientRect())
    .filter((box): box is DOMRect => !!box);
  const clearance = toasterClearance(boxes, window.innerHeight);
  const { style } = document.documentElement;
  if (clearance > 0) style.setProperty(TOASTER_CLEARANCE_VAR, `${clearance}px`);
  else style.removeProperty(TOASTER_CLEARANCE_VAR);
}

function scheduleClearance(): void {
  if (frame) return;
  frame = requestAnimationFrame(applyClearance);
}

const LISTENED_EVENTS = [
  "scroll",
  "resize",
  "transitionend",
  "animationend",
] as const;

function listen(isListening: boolean): void {
  const method = isListening ? "addEventListener" : "removeEventListener";
  for (const event of LISTENED_EVENTS)
    window[method](event, scheduleClearance, { capture: true, passive: true });
}

function setBarShown(id: symbol, element: BarElement, isShown: boolean): void {
  const wasEmpty = shownBars.size === 0;
  if (isShown) shownBars.set(id, element);
  else shownBars.delete(id);
  if (wasEmpty !== (shownBars.size === 0)) listen(shownBars.size > 0);
  scheduleClearance();
}

/**
 * Keeps the toaster clear of the calling bar while `isShown` holds and the
 * bar sits on the bottom edge of the viewport: the toast stack rises above
 * it instead of covering its buttons, and drops back once it hides.
 */
export function trackToasterClearance(
  element: BarElement,
  isShown: () => boolean,
): void {
  const id = Symbol("toaster-clearance");
  let isMounted = false;
  const stop = watch(
    isShown,
    (shown) => {
      if (isMounted) setBarShown(id, element, shown);
    },
    { flush: "post" },
  );
  onMounted(() => {
    isMounted = true;
    setBarShown(id, element, isShown());
  });
  onBeforeUnmount(() => {
    stop();
    isMounted = false;
    setBarShown(id, element, false);
  });
}
