import { router as inertiaRouter } from "@inertiajs/vue3";

/** How long a cancelled reload waits for the page to settle before it starts again anyway. */
const SETTLE_TIMEOUT_MS = 2_000;

/**
 * Resolves once the page on screen settles after a visit cancelled a reload:
 * Inertia sets a new page (a visit, a prefetched one or a history step), a
 * visit that was neither cancelled nor interrupted finishes, or
 * `SETTLE_TIMEOUT_MS` pass, so a cancellation that nothing follows cannot
 * hold the resync.
 */
function pageSettled(): Promise<void> {
  return new Promise((resolve) => {
    const stops = [
      inertiaRouter.on("navigate", () => settle()),
      inertiaRouter.on("finish", (event) => {
        const { visit } = event.detail;
        if (!visit.cancelled && !visit.interrupted) settle();
      }),
    ];
    const timer = setTimeout(() => settle(), SETTLE_TIMEOUT_MS);
    function settle(): void {
      clearTimeout(timer);
      for (const stop of stops) stop();
      resolve();
    }
  });
}

/**
 * A partial reload of the page on screen: the server sends the site layout
 * and the page fresh, and they replace the browser's copies, the layout
 * Inertia carries from page to page included. Resolves `landed` when its
 * answer reached the page, a redirect included. Resolves `cancelled` when a
 * visit cancelled or interrupted it, and `dropped` when another visit or a
 * history step set a page while it ran, which makes Inertia drop its answer:
 * both leave the layout the browser holds. A failure rejects and leaves the
 * page as it is: Inertia would otherwise show the error in its place.
 */
function reloadSiteLayoutAndPage(): Promise<
  "landed" | "cancelled" | "dropped"
> {
  return new Promise((resolve, reject) => {
    let failure: Error | undefined;
    const pagesSetBy: Array<string | undefined> = [];
    const stopWatching = inertiaRouter.on("navigate", (event) => {
      pagesSetBy.push(event.detail.visitId);
    });
    const reload = (): void =>
      inertiaRouter.reload({
        only: ["shared", "page"],
        onHttpException: (response) => {
          failure = new Error(`Site layout reload failed (${response.status})`);
          return false;
        },
        onNetworkError: (error) => {
          failure = error;
          return false;
        },
        onFinish: (visit) => {
          stopWatching();
          if (failure) reject(failure);
          else if (visit.cancelled || visit.interrupted) resolve("cancelled");
          else if (pagesSetBy.some((visitId) => visitId !== visit.id)) {
            resolve("dropped");
          } else resolve("landed");
        },
      });
    try {
      reload();
    } catch (error) {
      stopWatching();
      throw error;
    }
  });
}

/**
 * Reloads the site layout and the page on screen until a reload lands: once
 * the page settles after a visit cancelled it, and again at once when
 * another page was set while it ran. Each reload that does not land follows
 * a visit, so this ends once navigation stops.
 */
export async function resyncSiteLayout(): Promise<void> {
  inertiaRouter.flushAll();
  for (;;) {
    const outcome = await reloadSiteLayoutAndPage();
    if (outcome === "landed") return;
    if (outcome === "cancelled") await pageSettled();
  }
}
