import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

// Any reka layer still open: a dialog, a drawer, a modal menu.
const OPEN_LAYER_SELECTOR = '[data-dismissable-layer][data-state="open"]';

// What blocks the page while it is mounted: a layer and a backdrop.
const LAYER_SELECTOR = "[data-dismissable-layer]";
const BLOCKING_SELECTOR = `${LAYER_SELECTOR}, [data-slot="overlay"]`;

// A drawer, a modal or a slideover still open: what a closing one covered.
const OPEN_DIALOG_SELECTOR = [
  '[role="dialog"][data-dismissable-layer][data-state="open"]',
  '[role="alertdialog"][data-dismissable-layer][data-state="open"]',
].join(", ");

// A popover's content is a dialog layer too, but anchored to its trigger: it
// covers nothing.
const POPOVER_SELECTOR = "[data-reka-popper-content-wrapper]";

/**
 * Whether a drawer, a modal or a slideover is open on the page, whoever
 * rendered it: the same dialogs the closing-layers watch tracks.
 * @internal
 */
export function hasOpenDialog(root: Document): boolean {
  return [...root.querySelectorAll(OPEN_DIALOG_SELECTOR)].some(
    (dialog) => !dialog.closest(POPOVER_SELECTOR),
  );
}

/**
 * {@link hasOpenDialog}, kept up to date while the calling component is
 * mounted: for what must step aside while a dialog covers the page (a
 * floating prompt). False on the server and until mounted.
 * @internal
 */
export function useOpenDialog(): Readonly<Ref<boolean>> {
  const isOpen = ref(false);
  let observer: MutationObserver | null = null;
  const update = () => {
    isOpen.value = hasOpenDialog(document);
  };
  onMounted(() => {
    // A dialog mounts open: its insertion counts, not only its state.
    observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributeFilter: ["data-state"],
    });
    update();
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });
  return isOpen;
}

// Reka's FocusScope, as it unmounts: cancelling it keeps the focus in place.
const UNMOUNT_AUTOFOCUS_EVENT = "focusScope.autoFocusOnUnmount";

/**
 * Set on the dialog a closing one uncovered, until that one has unmounted:
 * the dialog's theme gives it its pointer events back (`UNCOVERED_PANEL_CLASS`).
 * @internal
 */
export const UNCOVERED_ATTRIBUTE = "data-dms-uncovered";

function isClosing(mutation: MutationRecord): boolean {
  const target = mutation.target as Element;
  return (
    target.getAttribute("data-state") === "closed" &&
    target.matches(BLOCKING_SELECTOR)
  );
}

/**
 * Lets the page be used as soon as any dialog, drawer, slideover or modal
 * menu starts closing, whoever rendered it, while it still animates out.
 *
 * - Reka sets the body's `pointer-events: none` from the content's
 *   dismissable layer and from the backdrop's scroll lock, and clears it only
 *   once they have animated out and unmounted (about 140 to 230ms): a click
 *   on the page in the meantime was lost. From reka 2.11 the lock is an owner
 *   of the body's pointer events, which the content letting go of them does
 *   not clear. The body is released after the closing render, once reka has
 *   let go of it, unless another layer is still open and blocks the page.
 * - A dialog closing over one that stays open (a confirm over a drawer)
 *   leaves the page blocked, but not the dialog below: reka disables every
 *   layer under the highest one that blocks the page, and the closing one
 *   stays the highest until it unmounts, so a click on the drawer was lost.
 *   The topmost dialog still open is marked uncovered until the closing one
 *   has unmounted or another one opens above it.
 * - A click that opens another drawer or modal in the meantime keeps it
 *   open: the closing one gave the focus back to its trigger as it unmounted,
 *   outside the new one, which closed at once. Its focus stays put when a
 *   layer opened since it started closing; one closing over a layer that
 *   stays open (a confirm over a drawer) still gives it back. Reka's event
 *   does not bubble, so it is caught on its way down.
 *
 * Returns the function that stops watching.
 * @internal
 */
export function watchClosingLayers(root: Document): () => void {
  // Each closing layer and the layers that were open when it started.
  const openBeforeClosing = new WeakMap<Element, Set<Element>>();
  const openLayers = () => [...root.querySelectorAll(OPEN_LAYER_SELECTOR)];
  const uncovering = watchUncovered(root);

  const observer = new MutationObserver((mutations) => {
    const closing = mutations
      .filter(isClosing)
      .map(({ target }) => target as Element);
    if (closing.length === 0) return;
    const open = openLayers();
    for (const target of closing) {
      openBeforeClosing.set(target, new Set(open));
    }
    uncovering.start(
      closing.filter((target) => target.matches(LAYER_SELECTOR)),
    );
    if (open.length > 0) return;
    if (root.body.style.pointerEvents === "none") {
      root.body.style.pointerEvents = "";
    }
  });
  observer.observe(root.body, {
    subtree: true,
    attributeFilter: ["data-state"],
  });

  const onUnmountAutoFocus = (event: Event): void => {
    const before = openBeforeClosing.get(event.target as Element);
    if (!before) return;
    if (openLayers().some((layer) => !before.has(layer))) {
      event.preventDefault();
    }
  };
  root.addEventListener(UNMOUNT_AUTOFOCUS_EVENT, onUnmountAutoFocus, true);

  return () => {
    observer.disconnect();
    uncovering.stop();
    root.removeEventListener(UNMOUNT_AUTOFOCUS_EVENT, onUnmountAutoFocus, true);
  };
}

interface Uncovering {
  /** Marks the topmost dialog still open while `closing` animates out. */
  start(closing: Element[]): void;
  stop(): void;
}

function watchUncovered(root: Document): Uncovering {
  let uncovered: Element | null = null;
  let closingLayers: Element[] = [];
  const topmostOpen = () =>
    [...root.querySelectorAll(OPEN_DIALOG_SELECTOR)].at(-1) ?? null;

  function stop(): void {
    watcher.disconnect();
    uncovered?.removeAttribute(UNCOVERED_ATTRIBUTE);
    uncovered = null;
    closingLayers = [];
  }

  // Only while a dialog closes over another: a short-lived watch of the DOM,
  // until the closing one is gone or another one opened above.
  const watcher = new MutationObserver(() => {
    const isStillCovering = closingLayers.some((layer) => layer.isConnected);
    if (!isStillCovering || topmostOpen() !== uncovered) stop();
  });

  function start(closing: Element[]): void {
    stop();
    const top = closing.length > 0 ? topmostOpen() : null;
    if (!top) return;
    uncovered = top;
    closingLayers = closing;
    top.setAttribute(UNCOVERED_ATTRIBUTE, "");
    watcher.observe(root.body, { childList: true, subtree: true });
  }

  return { start, stop };
}
