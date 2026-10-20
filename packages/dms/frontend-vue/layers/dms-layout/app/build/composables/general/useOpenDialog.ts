import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

// Every Reka dialog renders its content so -- a modal, a slideover, a drawer,
// a confirmation -- whoever opens it and wherever it is teleported.
const OPEN_DIALOG_SELECTOR = '[role="dialog"][data-state="open"]';
// A popover's content is a dialog too, but it stays anchored to its trigger.
const POPOVER_SELECTOR = "[data-reka-popper-content-wrapper]";

function hasOpenDialog(): boolean {
  return Array.from(document.querySelectorAll(OPEN_DIALOG_SELECTOR)).some(
    (element) => !element.closest(POPOVER_SELECTOR),
  );
}

/**
 * Whether a drawer, modal or other dialog is open on the page, read from the
 * DOM so it covers every way one is opened. False on the server and until
 * mounted.
 *
 * @internal
 */
export function useOpenDialog(): Readonly<Ref<boolean>> {
  const isOpen = ref(false);
  let observer: MutationObserver | null = null;
  const update = () => {
    isOpen.value = hasOpenDialog();
  };
  onMounted(() => {
    observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "role"],
    });
    update();
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });
  return isOpen;
}
