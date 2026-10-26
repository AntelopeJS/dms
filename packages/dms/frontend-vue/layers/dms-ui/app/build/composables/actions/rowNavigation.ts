import { get } from "@nuxt/ui/runtime/utils/index.js";
import { effectScope, shallowRef, watch } from "vue";
import type { RowNavigation } from "../../../types/row-navigation";

/**
 * Where a row stands among all the rows the table lists, under its current
 * query, and the rows on each side of it.
 */
export interface RowLocation {
  /** From 0. */
  index: number;
  total: number;
  prev?: Data;
  next?: Data;
}

/** The rows a container steps through, in the order the table shows them. */
export interface RowNavigationSource {
  rows: () => Data[];
  rowIdKey: string;
  /**
   * Reads one row by id (the table's `get` route or `fetchRowUrl`): what a
   * container's `showRow` falls back to for a row the table does not list.
   */
  getRow?: (id: string) => Promise<Data | undefined>;
  /** The table's count of rows, past the ones loaded; `rows` without it. */
  total?: () => number | undefined;
  /** Position of the first row loaded among all the rows (a page's start). */
  offset?: () => number;
  /**
   * Moves the table to its next (`1`) or previous (`-1`) page, or grows a
   * feed by one, and resolves once the rows are loaded; `false` when there is
   * no such page or it could not be read. A step past the rows loaded turns
   * it, so the table shows the row the container lands on.
   */
  loadAdjacent?: (step: RowStep) => Promise<boolean>;
  /**
   * Finds a row among all the rows the table lists, under its current query
   * (a deep link to a row past the page loaded, a row live updates pushed
   * out of it); `hint` is where it last stood. Undefined when it is not
   * listed, or too far to look for.
   */
  locate?: (id: string, hint?: number) => Promise<RowLocation | undefined>;
}

/** A step through the rows: `1` to the next, `-1` to the previous. */
export type RowStep = 1 | -1;

/**
 * What a drawer, modal or side panel opened on a row receives to show
 * another row of the same table in its place (`showRow` prop): the row
 * itself, or its id, read from the rows shown or else from the table's route.
 * The table then treats it as the open row: its highlight, its position, its
 * `?record=`. It rejects when the row could not be read.
 */
export type ShowRow = (row: Data | string) => Promise<void>;

const rowIdOf = (row: Data, rowIdKey: string): string =>
  String(get(row, rowIdKey));

const loadedIndexOf = (source: RowNavigationSource, id: string): number =>
  source
    .rows()
    .findIndex((candidate) => rowIdOf(candidate, source.rowIdKey) === id);

/** Where the row stands, read from the rows loaded. */
function loadedLocation(
  source: RowNavigationSource,
  id: string,
): RowLocation | undefined {
  const rows = source.rows();
  const local = loadedIndexOf(source, id);
  if (local < 0) return undefined;
  const index = (source.offset?.() ?? 0) + local;

  const total = Math.max(source.total?.() ?? rows.length, index + 1);
  return { index, total, prev: rows[local - 1], next: rows[local + 1] };
}

/** The navigation of a row at `location`. */
function navigationAt(
  source: RowNavigationSource,
  location: RowLocation,
  isLoaded: boolean,
  step: (direction: RowStep) => () => void,
): RowNavigation {
  const reachesPast = isLoaded && !!(source.loadAdjacent || source.locate);
  const { index, total } = location;
  return {
    index,
    total,
    hasPrev: !!location.prev || (reachesPast && index > 0),
    hasNext: !!location.next || (reachesPast && index < total - 1),
    prev: step(-1),
    next: step(1),
  };
}

/**
 * Follows the navigation of `row` among the rows of the table, calling
 * `onChange` with it now and whenever it moves: the rows reloaded, live
 * updates, the row found past the rows loaded (`locate`). Undefined while
 * its position is unknown. A step goes to the open row's neighbour in the
 * table's current order (`go`), found by the open row's id, never by a
 * position the rows may have shifted from: past the rows loaded, it turns
 * the table's page when it can, and asks `locate`. Returns the tracking's
 * stop.
 */
export function trackRowNavigation(
  source: RowNavigationSource,
  row: Data,
  go: (row: Data) => void,
  onChange: (navigation: RowNavigation | undefined) => void,
): () => void {
  const id = rowIdOf(row, source.rowIdKey);
  const located = shallowRef<RowLocation>();
  let lastIndex: number | undefined;
  let isStopped = false;

  let isUnlisted = false;
  let locating: Promise<RowLocation | undefined> | undefined;

  const locate = (): Promise<RowLocation | undefined> => {
    if (!source.locate) return Promise.resolve(undefined);

    locating ??= source
      .locate(id, lastIndex)
      .catch(() => undefined)
      .then((found) => {
        if (isStopped) return found;
        located.value = found;
        isUnlisted = !found;
        return found;
      })
      .finally(() => {
        locating = undefined;
      });
    return locating;
  };

  const landOn = (target: Data) => {
    if (isStopped) return;
    const local = loadedIndexOf(source, rowIdOf(target, source.rowIdKey));
    go(local < 0 ? target : source.rows()[local]!);
  };

  const neighbourOf = (direction: RowStep, location?: RowLocation) =>
    direction > 0 ? location?.next : location?.prev;

  const stepPast = async (direction: RowStep, loaded?: RowLocation) => {
    const isTurned =
      !!loaded &&
      !!source.loadAdjacent &&
      (await source.loadAdjacent(direction));
    const target =
      neighbourOf(direction, loadedLocation(source, id)) ??
      neighbourOf(direction, await locate());
    if (target) return landOn(target);

    if (!isTurned || !loaded) return;
    const offset = source.offset?.() ?? 0;
    const landed = source.rows()[loaded.index + direction - offset];
    if (landed) landOn(landed);
  };

  const step = (direction: RowStep) => () => {
    const loaded = loadedLocation(source, id);
    const neighbour = neighbourOf(direction, loaded);

    if (neighbour) return go(neighbour);
    void stepPast(direction, loaded);
  };

  const scope = effectScope(true);
  scope.run(() => {
    watch(
      () => {
        const loaded = loadedLocation(source, id);
        const location = loaded ?? located.value;
        return location && navigationAt(source, location, !!loaded, step);
      },
      (navigation) => {
        if (navigation) lastIndex = navigation.index;
        onChange(navigation);
      },
      { immediate: true, flush: "sync" },
    );

    watch(
      () => [source.rows(), source.total?.()],
      () => {
        if (loadedIndexOf(source, id) >= 0) {
          isUnlisted = false;
          return;
        }
        if (!isUnlisted) void locate();
      },
      { immediate: true },
    );
  });
  return () => {
    isStopped = true;
    scope.stop();
  };
}

const ROW_STEP_KEYS: Record<
  string,
  keyof Pick<RowNavigation, "prev" | "next">
> = { j: "next", k: "prev" };

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const isTypingTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable || TYPING_TAGS.has(element.tagName);
};

/**
 * J and K step to the next and previous row while a row's container is
 * open, unless the user types in a field. Returns the listener's removal.
 */
export function listenRowSteps(current: () => RowNavigation | undefined) {
  const onKey = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    const step = ROW_STEP_KEYS[event.key.toLowerCase()];
    const navigation = current();
    if (!step || !navigation) return;
    event.preventDefault();
    navigation[step]();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}

const CLOSE_KEY = "Escape";

/**
 * Escape closes a row's side panel, unless the user types in a field or a
 * layer above it (a dialog, a menu) already handled the key. Returns the
 * listener's removal.
 */
export function listenRowPanelClose(close: () => void) {
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== CLOSE_KEY || event.defaultPrevented) return;
    if (isTypingTarget(event.target)) return;
    close();
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
