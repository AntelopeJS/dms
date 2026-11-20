import { onBeforeUnmount, watch, type Ref } from "vue";
import { blockAnchorAt, blockAnchorElements } from "../page/blockAnchors";
import { PREVIEW_ROOT_ID_PREFIX } from "../../utils/blockPreview";
import {
  PREVIEW_HEADER_ATTRIBUTE,
  PREVIEW_NAVIGATION_ATTRIBUTE,
} from "./previewNavigation";

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
  /** Called when a click landed on the page and in no block: its header, or the empty space around its blocks. */
  onSelectPage?: () => void;
  /** Called with the layout path and the element of a text double-clicked in a block. */
  onText?: (path: string, element: Element) => void;
  /** Called with a Ctrl or ⌘ click: true when it followed a link, which then picks nothing. */
  onFollow?: (event: MouseEvent) => boolean;
}

function isFollowClick(event: Event): event is MouseEvent {
  return (
    event.type === "click" &&
    event instanceof MouseEvent &&
    (event.ctrlKey || event.metaKey)
  );
}

function isInNavigation(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(`[${PREVIEW_NAVIGATION_ATTRIBUTE}]`) !== null
  );
}

function headerAt(target: EventTarget | null): Element | undefined {
  return target instanceof Element
    ? (target.closest(`[${PREVIEW_HEADER_ATTRIBUTE}]`) ?? undefined)
    : undefined;
}

function sameElements(left: Element[], right: Element[]): boolean {
  return (
    left.length === right.length &&
    left.every((element, index) => element === right[index])
  );
}

/**
 * Lets the page's blocks be picked by clicking. While `enabled`, the block
 * under the pointer is outlined and a click selects it instead of reaching it;
 * a Ctrl or ⌘ click on a link follows it instead. A click on the page that
 * lands on no block, its header or the empty space around its blocks, picks the
 * page.
 * A block is found through the anchors `RecursiveComponent` registers by layout
 * path, so nothing is added to the rendered blocks and nothing runs until the
 * pointer moves.
 */
export function useBlockInspector(options: InspectorOptions): void {
  let outlined: Element[] = [];

  function outline(next: Element[]): void {
    if (sameElements(next, outlined)) return;
    for (const element of outlined) {
      element.removeAttribute(INSPECT_TARGET_ATTRIBUTE);
    }
    for (const element of next)
      element.setAttribute(INSPECT_TARGET_ATTRIBUTE, "");
    outlined = next;
  }

  function onPointerOver(event: Event): void {
    const header = headerAt(event.target);
    if (header) {
      outline([header]);
      return;
    }
    const path = blockAnchorAt(event.target, PREVIEW_ROOT_ID_PREFIX);
    outline(path ? blockAnchorElements(path) : []);
  }

  function onPointerLeave(): void {
    outline([]);
  }

  function onSwallowed(event: Event): void {
    if (isInNavigation(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    if (isFollowClick(event) && options.onFollow?.(event)) return;
    const path = blockAnchorAt(event.target, PREVIEW_ROOT_ID_PREFIX);
    if (!path) {
      if (event.type === "click") options.onSelectPage?.();
      return;
    }
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
    outline([]);
  }

  watch(options.enabled, (enabled) => (enabled ? start() : stop()), {
    flush: "sync",
  });
  onBeforeUnmount(stop);
}
