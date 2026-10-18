import { shallowRef } from "vue";

// Client-only, like the live controller it mirrors: the server renders no
// poll, and a module-level value there would be shared between requests.
const pausedSource = shallowRef<(() => boolean) | null>(null);

/**
 * Hands the core layer the paused state of the live page on screen, `null`
 * when the page has no `live` option. The live controller lives in the UI
 * layer, which the core layer does not import: the page renderer's
 * `setCurrentPageLive()` calls it.
 *
 * @internal
 */
export function setPageLivePause(isPaused: (() => boolean) | null): void {
  if (typeof window === "undefined") return;
  pausedSource.value = isPaused;
}

/**
 * The live page on screen is paused (by the user, a hold or a hidden tab).
 * Reactive; `false` on a page without `live`.
 *
 * @internal
 */
export function isPageLivePaused(): boolean {
  return pausedSource.value?.() ?? false;
}
