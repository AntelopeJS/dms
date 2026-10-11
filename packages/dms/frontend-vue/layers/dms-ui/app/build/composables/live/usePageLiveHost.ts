import { onScopeDispose, watch } from "vue";
import type { PageLiveOptions } from "../../../types/live";
import { setCurrentPageLive } from "./currentPageLive";
import {
  createPageLiveController,
  type PageLiveController,
} from "./pageLiveController";

/** The page the renderer shows: its id and its `live` option. */
export interface PageLiveSource {
  pageId: string | undefined;
  live: PageLiveOptions | undefined;
}

/**
 * Gives the page on screen its live controller while it declares `live`, and
 * a new one when the renderer moves to another page. Browser only.
 *
 * @internal
 */
export function usePageLiveHost(source: () => PageLiveSource): void {
  if (typeof window === "undefined") return;
  let controller: PageLiveController | null = null;

  const install = (next: PageLiveController | null) => {
    controller?.dispose();
    controller = next;
    setCurrentPageLive(next);
  };

  watch(
    () => {
      const { pageId, live } = source();
      return pageId && live ? JSON.stringify([pageId, live]) : "";
    },
    (key) => {
      const { pageId, live } = source();
      install(
        key && pageId && live ? createPageLiveController(pageId, live) : null,
      );
    },
    { immediate: true },
  );

  onScopeDispose(() => install(null));
}
