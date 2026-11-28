import type { router } from "@inertiajs/vue3";

/** The options `router.reload` takes. */
export type InertiaReloadOptions = NonNullable<
  Parameters<typeof router.reload>[0]
>;

/** The visit Inertia hands `onFinish` and the `finish` event. */
export type InertiaActiveVisit = Parameters<
  NonNullable<InertiaReloadOptions["onFinish"]>
>[0];

/** How a visit ended. */
export interface VisitOutcome {
  cancelled: boolean;
  interrupted: boolean;
}

const ignore = (): undefined => undefined;

/** A finished visit of the page on screen, ended as `outcome` says. */
export function finishedVisit(outcome: VisitOutcome): InertiaActiveVisit {
  return {
    id: "visit",
    url: new URL(window.location.href),
    completed: !outcome.cancelled && !outcome.interrupted,
    ...outcome,
    method: "get",
    data: {},
    replace: false,
    preserveScroll: true,
    preserveState: true,
    only: [],
    except: [],
    headers: {},
    errorBag: null,
    forceFormData: false,
    queryStringArrayFormat: "brackets",
    async: true,
    showProgress: false,
    prefetch: false,
    fresh: false,
    reset: [],
    preserveUrl: false,
    preserveErrors: false,
    invalidateCacheTags: [],
    viewTransition: false,
    component: null,
    pageProps: null,
    cached: false,
    onCancelToken: ignore,
    onBefore: ignore,
    onBeforeUpdate: ignore,
    onStart: ignore,
    onProgress: ignore,
    onFinish: ignore,
    onCancel: ignore,
    onSuccess: ignore,
    onError: ignore,
    onHttpException: ignore,
    onNetworkError: ignore,
    onFlash: ignore,
    onPrefetched: ignore,
    onPrefetching: ignore,
  };
}

/** Inertia's global `finish` event, as the router fires it on `document`. */
export function dispatchFinish(outcome: VisitOutcome): void {
  document.dispatchEvent(
    new CustomEvent("inertia:finish", {
      detail: { visit: finishedVisit(outcome) },
    }),
  );
}
