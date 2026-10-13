import { router as inertiaRouter } from "@inertiajs/vue3";
import { onBeforeUnmount, onMounted, watch } from "vue";
import type { CustomRowAction } from "../../../types/row-action";
import {
  deepLinkOutcome,
  type DeepLinkedRow,
  readRecordId,
  writeRecordId,
} from "./utils/recordLink";
import { queryOfUrl } from "./utils/urlFilters";
import type { TableUrlScope } from "./utils/views";

/** What `useTableRecordLink` follows the URL's `?record=` with. */
export interface TableRecordLinkOptions<T> {
  route: { query: Record<string, unknown> };
  urlScope: TableUrlScope;
  /** The table's `deepLink` action: the container a link opens. */
  action: CustomRowAction;
  /** Finds the row a link names, once the list is loaded. */
  resolve: (id: string) => Promise<DeepLinkedRow<T>>;
  /** Opens the row found in the action's container. */
  open: (row: T) => void;
  /** Opens a side panel's own "no longer available" state on the id. */
  showMissing: (id: string) => void;
  /** Tells the user the link led nowhere, or could not be followed. */
  notify: (outcome: "notify" | "notifyFailed") => void;
}

/** What the table tells the link about the row its container shows. */
export interface TableRecordLink {
  /**
   * The row the action's container shows, as written in the URL, or
   * `undefined` once it closed: a link to the row shown opens nothing again,
   * a link to a row closed reopens it.
   */
  shown: (id?: string) => void;
}

/**
 * Opens the row the URL's `?record=` names: on arrival, and on each visit
 * that keeps the page mounted (a link to the same page naming a row, back and
 * forward), as a fresh load would. The visit is followed rather than the
 * route's value: the table writes and removes the key in place, so a link to
 * a row closed meanwhile leaves the route's value unchanged. A link naming no
 * row removes the key and tells the user.
 */
export function useTableRecordLink<T>(
  options: TableRecordLinkOptions<T>,
): TableRecordLink {
  const { action, urlScope } = options;
  // The row opened or being opened: arrival and the visit that mounted the
  // table name it twice, a visit while it is open names it again.
  let linkedId: string | undefined;

  const settle = async (id: string) => {
    const found = await options.resolve(id);
    const outcome = deepLinkOutcome(found, action);
    if (outcome === "open") return options.open(found.row as T);
    if (outcome === "missingPanel") return options.showMissing(id);
    writeRecordId(urlScope);
    if (linkedId === id) linkedId = undefined;
    options.notify(outcome);
  };

  const follow = (query: Record<string, unknown>) => {
    const id = readRecordId(query, urlScope);
    if (!id || id === linkedId) return;
    linkedId = id;
    void settle(id);
  };

  let stopFollowingVisits: (() => void) | undefined;
  onMounted(() => {
    follow(options.route.query);
    stopFollowingVisits = inertiaRouter.on("navigate", (event) =>
      follow(queryOfUrl(event.detail.page.url)),
    );
  });
  onBeforeUnmount(() => stopFollowingVisits?.());

  // A visit Inertia does not announce (a `router.replace`) still moves the
  // route: a new value there is followed as well.
  watch(
    () => readRecordId(options.route.query, urlScope),
    () => follow(options.route.query),
  );

  return {
    shown: (id) => {
      linkedId = id;
    },
  };
}
