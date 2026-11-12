import { onBeforeUnmount, watch, type Ref } from "vue";
import { blockAnchorAt, blockAnchorElements } from "../page/blockAnchors";
import { PREVIEW_NAVIGATION_ATTRIBUTE } from "./previewNavigation";

/** Attribute the hovered block's elements carry while inspecting, for the outline. */
export const INSPECT_TARGET_ATTRIBUTE = "data-dms-inspect-target";

/**
 * Pointer events a block would act on. While inspecting they stop at the
 * window, before the page: `click` selects, `dblclick` reports the text under
 * the pointer, the rest is swallowed so a press, a menu trigger or a drag
 * handle does nothing. The sidebar a mockup draws keeps its clicks.
 */
const SWALLOWED_EVENTS = [
  "pointerdown",
  "mousedown",
  "mouseup",
  "click",
  "dblclick",
];

interface InspectorOptions {
  enabled: Readonly<Ref<boolean>>;
  /** Called with the layout path of the block a click landed in. */
  onSelect: (path: string) => void;
  /** Called with the layout path and the element of a text double-clicked in a block. */
  onText?: (path: string, element: Element) => void;
}

function isInNavigation(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(`[${PREVIEW_NAVIGATION_ATTRIBUTE}]`) !== null
  );
}

function sameElements(left: Element[], right: Element[]): boolean {
  return (
    left.length === right.length &&
    left.every((element, index) => element === right[index])
  );
}

/**
 * Lets the page's blocks be picked by clicking. While `enabled`, the block
 * under the pointer is outlined and a click selects it instead of reaching it.
 * A block is found through the anchors `RecursiveComponent` registers by layout
 * path, so nothing is added to the rendered blocks and nothing runs until the
 * pointer moves.
 */
export function useBlockInspector(options: InspectorOptions): void {
  let outlined: Element[] = [];

  function outline(path: string | undefined): void {
    const next = path ? blockAnchorElements(path) : [];
    if (sameElements(next, outlined)) return;
    for (const element of outlined) {
      element.removeAttribute(INSPECT_TARGET_ATTRIBUTE);
    }
    for (const element of next)
      element.setAttribute(INSPECT_TARGET_ATTRIBUTE, "");
    outlined = next;
  }

  function onPointerOver(event: Event): void {
    outline(blockAnchorAt(event.target));
  }

  function onPointerLeave(): void {
    outline(undefined);
  }

  function onSwallowed(event: Event): void {
    if (isInNavigation(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const path = blockAnchorAt(event.target);
    if (!path) return;
    if (event.type === "click") options.onSelect(path);
    const { target } = event;
    if (
      event.type === "dblclick" &&
      target instanceof Element &&
      target.textContent?.trim()
    ) {
      options.onText?.(path, target);
    }
  }

  function start(): void {
    for (const type of SWALLOWED_EVENTS) {
      window.addEventListener(type, onSwallowed, true);
    }
    window.addEventListener("pointerover", onPointerOver, true);
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
  }

  function stop(): void {
    for (const type of SWALLOWED_EVENTS) {
      window.removeEventListener(type, onSwallowed, true);
    }
    window.removeEventListener("pointerover", onPointerOver, true);
    document.documentElement.removeEventListener(
      "pointerleave",
      onPointerLeave,
    );
    outline(undefined);
  }

  watch(options.enabled, (enabled) => (enabled ? start() : stop()), {
    flush: "sync",
  });
  onBeforeUnmount(stop);
}
