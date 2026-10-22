import { inject, type InjectionKey } from "vue";

/**
 * Whether the page on screen is paused right now (by the user, a hold or a
 * hidden tab). Reactive: it reads reactive state, so a `watch` or a
 * `computed` over it follows the pause.
 */
export type LivePauseSource = () => boolean;

/**
 * The extension point the core layer reads a page's pause through. The core
 * owns `useApiData` but not the page's live controller: the layer that owns
 * the controller provides a source at the app level
 * (`app.provide(LIVE_PAUSE_SOURCE, source)`), so every component reads the
 * same page, drawers and modals included. Without one, nothing is paused.
 */
export const LIVE_PAUSE_SOURCE: InjectionKey<LivePauseSource> = Symbol(
  "dms-live-pause-source",
);

const NEVER_PAUSED: LivePauseSource = () => false;

/**
 * The pause source of the app the calling component belongs to; never
 * paused without one. Call it in a component setup.
 */
export function useLivePauseSource(): LivePauseSource {
  return inject(LIVE_PAUSE_SOURCE, NEVER_PAUSED);
}
