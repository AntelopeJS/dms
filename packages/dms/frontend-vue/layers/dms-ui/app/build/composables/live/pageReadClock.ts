import { type Ref, readonly, shallowRef } from "vue";

// Client-only, like the live controller: the browser shows one page at a
// time, and a module-level value on the server would be shared between
// requests.
const readAt = shallowRef<number | null>(null);

/**
 * When the page on screen last read its data (ms since the epoch), on a page
 * with or without `live`: set when the page is shown, each time its blocks
 * read again outside a live gate, and once a `refreshPageBlocks()` is done.
 * `null` before the first page (and on the server). A live page's own clock
 * is its controller's `lastUpdatedAt`.
 *
 * @internal
 */
export const pageReadAt: Readonly<Ref<number | null>> = readonly(readAt);

/**
 * Records that the page on screen read its data now. Does nothing on the
 * server.
 *
 * @internal
 */
export function markPageRead(): void {
  if (typeof window === "undefined") return;
  readAt.value = Date.now();
}
