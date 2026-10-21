// Any reka layer still open: a dialog, a drawer, a modal menu.
const OPEN_LAYER_SELECTOR = '[data-dismissable-layer][data-state="open"]';

// What blocks the page while it is mounted: a layer and a backdrop.
const BLOCKING_SELECTOR = '[data-dismissable-layer], [data-slot="overlay"]';

// Reka's FocusScope, as it unmounts: cancelling it keeps the focus in place.
const UNMOUNT_AUTOFOCUS_EVENT = "focusScope.autoFocusOnUnmount";

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

  const observer = new MutationObserver((mutations) => {
    const closing = mutations.filter(isClosing);
    if (closing.length === 0) return;
    const open = openLayers();
    for (const { target } of closing) {
      openBeforeClosing.set(target as Element, new Set(open));
    }
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
    root.removeEventListener(UNMOUNT_AUTOFOCUS_EVENT, onUnmountAutoFocus, true);
  };
}
