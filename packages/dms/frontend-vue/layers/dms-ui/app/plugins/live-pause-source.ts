import { LIVE_PAUSE_SOURCE } from "#dms-core/app/composables/live/livePauseSource";
import { currentPageLive } from "../build/composables/live/currentPageLive";

/**
 * Gives the core layer the pause of the page on screen (its live
 * controller), so a component's own polling (`useApiData`'s
 * `refreshInterval`) stops with the page's blocks. The server renders no
 * poll and installs no controller: it reads as never paused.
 */
export default defineDmsPlugin(({ vueApp }) => {
  vueApp.provide(
    LIVE_PAUSE_SOURCE,
    () => currentPageLive()?.isPaused.value ?? false,
  );
});
