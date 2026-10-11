import { onMounted, onScopeDispose, watch } from "vue";
import type { PageLiveOptions } from "../../../types/live";
import { setCurrentPageLive } from "./currentPageLive";
import {
  createPageLiveController,
  type PageLiveController,
} from "./pageLiveController";

/** The URL query key opening a live page paused: `?live=0`. */
const LIVE_URL_KEY = "live";
const LIVE_URL_PAUSED = "0";

/** The page the renderer shows: its id and its `live` option. */
export interface PageLiveSource {
  pageId: string | undefined;
  live: PageLiveOptions | undefined;
}

/** What the page's controller follows around it. @internal */
export interface PageLiveEnvironment {
  /** The realtime stream is open; while it is not, the page polls. */
  isStreamConnected?: () => boolean;
}

/** The URL asks for the page paused (`?live=0`). @internal */
export function isPausedByUrl(): boolean {
  return (
    new URLSearchParams(window.location.search).get(LIVE_URL_KEY) ===
    LIVE_URL_PAUSED
  );
}

// Resumed, the page no longer opens paused: a reload keeps it live.
function dropUrlPause(): void {
  if (!isPausedByUrl()) return;
  const url = new URL(window.location.href);
  url.searchParams.delete(LIVE_URL_KEY);
  window.history.replaceState(window.history.state, "", url.href);
}

/**
 * Binds a controller to the browser around it: a hidden tab pauses it, the
 * stream state switches its polling, and resuming drops `?live=0` from the
 * URL. Returns the unbinding.
 *
 * @internal
 */
export function bindPageLiveEnvironment(
  controller: PageLiveController,
  environment: PageLiveEnvironment,
): () => void {
  const onVisibility = () =>
    controller.setHidden(document.visibilityState === "hidden");
  onVisibility();
  document.addEventListener("visibilitychange", onVisibility);
  const stops = [
    () => document.removeEventListener("visibilitychange", onVisibility),
    watch(
      () => environment.isStreamConnected?.() ?? true,
      (isConnected) => controller.setStreamConnected(isConnected),
      { immediate: true },
    ),
    watch(controller.isPaused, (isPaused) => {
      if (!isPaused) dropUrlPause();
    }),
  ];
  return () => stops.forEach((stop) => stop());
}

/**
 * Gives the page on screen its live controller while it declares `live`, and
 * a new one when the renderer moves to another page. Browser only.
 *
 * @internal
 */
export function usePageLiveHost(
  source: () => PageLiveSource,
  environment: PageLiveEnvironment = {},
): void {
  if (typeof window === "undefined") return;
  let controller: PageLiveController | null = null;
  let unbind: (() => void) | null = null;
  // The server renders every page live: the remembered pause applies once
  // mounted, so the hydrating render draws the same rows.
  let isMounted = false;
  onMounted(() => {
    isMounted = true;
    controller?.restoreChoice();
  });

  const install = (next: PageLiveController | null) => {
    unbind?.();
    controller?.dispose();
    controller = next;
    unbind = next ? bindPageLiveEnvironment(next, environment) : null;
    setCurrentPageLive(next);
  };

  watch(
    () => {
      const { pageId, live } = source();
      return pageId && live ? JSON.stringify([pageId, live]) : "";
    },
    (key) => {
      const { pageId, live } = source();
      const next =
        key && pageId && live
          ? createPageLiveController(pageId, live, {
              isPausedByUrl: isPausedByUrl(),
              isRestoreDeferred: true,
            })
          : null;
      install(next);
      if (isMounted) next?.restoreChoice();
    },
    { immediate: true },
  );

  onScopeDispose(() => install(null));
}
