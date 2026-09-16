import type { Component } from "vue";
import type { ContainerInstance, ContainerOptions } from "./types";

type Overlay = ReturnType<typeof useOverlay>;

/**
 * Defer `open` until any closing Reka UI menu has left the DOM.
 *
 * When a container is opened from a menu (e.g. the table-view row-actions
 * dropdown's "View details"), the menu is still animating closed. Opening a
 * drawer/modal overlay while the menu is mid-close lets the menu's teardown
 * (focus return + dismiss events) instantly dismiss the fresh overlay — it
 * flashes in and back out, so nothing shows. So we poll until no `[role="menu"]`
 * remains, then leave a short beat for its focus handling to settle before
 * opening. Paths with no open menu (row double-click, direct calls) open on the
 * spot. Returns a canceller so a pending open can be aborted (see `close`).
 */
function openWhenMenusClosed(open: () => void): () => void {
  if (
    typeof document === "undefined" ||
    !document.querySelector('[role="menu"]')
  ) {
    open();
    return () => {};
  }

  const STEP_MS = 32;
  const MAX_MS = 800;
  const SETTLE_MS = 60;
  let waited = 0;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  const poll = setInterval(() => {
    waited += STEP_MS;
    if (document.querySelector('[role="menu"]') && waited < MAX_MS) return;
    clearInterval(poll);
    settleTimer = setTimeout(open, SETTLE_MS);
  }, STEP_MS);

  return () => {
    clearInterval(poll);
    if (settleTimer !== null) clearTimeout(settleTimer);
  };
}

/**
 * Shared opening logic behind {@link useDrawer} and {@link useModal}: create the
 * themed overlay, ensure a unique `containerId` for the leave-guard system, mark
 * the body component raw so Vue keeps it as-is, and expose the open `result`
 * promise together with a programmatic `close`.
 */
export function openDynamicContainer<Result, Options extends ContainerOptions>(
  overlay: Overlay,
  container: Component,
  idPrefix: string,
  options: Options,
): ContainerInstance<Result> {
  const { component, headerComponent, containerId, ...rest } = options;
  const instance = overlay.create(container, {
    props: {
      ...rest,
      containerId: containerId ?? `${idPrefix}-${crypto.randomUUID()}`,
      component: markRaw(component),
      ...(headerComponent && { headerComponent: markRaw(headerComponent) }),
    },
  });

  // The actual open is deferred past any closing menu; expose the eventual
  // open() result through a stable promise and let close() abort a still-pending
  // open (or resolve its result if it never opened).
  let opened = false;
  let resolveResult!: (value: Result) => void;
  let rejectResult!: (reason?: unknown) => void;
  const result = new Promise<Result>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const cancelPendingOpen = openWhenMenusClosed(() => {
    opened = true;
    // Forward both settle paths: a render error inside the mounted component
    // must reject `result` rather than leave it pending (and unhandled), as the
    // original `return instance.open()` did.
    (instance.open() as Promise<Result>).then(resolveResult, rejectResult);
  });

  return {
    result,
    close: (value?: Result) => {
      if (opened) {
        instance.close(value);
      } else {
        // Closed before the deferred open fired: abort the pending open and tear
        // down the eagerly-created overlay so it isn't orphaned in the manager.
        cancelPendingOpen();
        instance.close(value);
        resolveResult(value as Result);
      }
    },
  };
}
