import { watch, type Ref } from "vue";

// Any reka layer still open: a dialog, a drawer, a modal menu.
const OPEN_LAYER_SELECTOR = '[data-dismissable-layer][data-state="open"]';

/**
 * Gives the page its clicks back as soon as a drawer or a modal starts
 * closing. Reka's body scroll lock, held by the backdrop, sets the body's
 * `pointer-events: none` and only clears it once the backdrop has faded out
 * and unmounted (about 140ms): a click on the page in the meantime was lost.
 * From reka 2.11 the lock is an owner of the body's pointer events, which the
 * content letting go of them (`disableOutsidePointerEvents`) does not clear.
 * Left alone while another layer is still open, which still blocks the page.
 * @internal
 */
export function useReleasePagePointerEvents(isOpen: Ref<boolean>): void {
  // After the render: reka's layer has let go of the body by then.
  watch(
    isOpen,
    (open) => {
      if (open || document.querySelector(OPEN_LAYER_SELECTOR)) return;
      document.body.style.pointerEvents = "";
    },
    { flush: "post" },
  );
}
