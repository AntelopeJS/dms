import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { RowNavigation } from "../../../types/row-navigation";

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
   * no such page or it could not be read.
   */
  loadAdjacent?: (step: RowStep) => Promise<boolean>;
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

interface RowPosition {
  /** Among the rows loaded. */
  local: number;
  /** Among all the rows the table lists. */
  global: number;
  total: number;
}

function rowPosition(
  source: RowNavigationSource,
  rows: Data[],
  row: Data,
): RowPosition | undefined {
  const id = rowIdOf(row, source.rowIdKey);
  const local = rows.findIndex(
    (candidate) => rowIdOf(candidate, source.rowIdKey) === id,
  );
  if (local < 0) return undefined;
  const global = (source.offset?.() ?? 0) + local;
  // The count can lag behind the rows (a row created since): never less.
  const total = Math.max(source.total?.() ?? rows.length, global + 1);
  return { local, global, total };
}

/**
 * The navigation of `row` among the rows of the table; `go` opens another
 * row in its place. Undefined when the row is not among the rows loaded
 * (opened from a link). A step past the rows loaded loads the adjacent page
 * (`loadAdjacent`) first.
 */
export function rowNavigation(
  source: RowNavigationSource,
  row: Data,
  go: (row: Data) => void,
): RowNavigation | undefined {
  const rows = source.rows();
  const position = rowPosition(source, rows, row);
  if (!position) return undefined;
  const { local, global, total } = position;
  const step = (direction: RowStep) => async () => {
    const target = rows[local + direction];
    if (target) return go(target);
    if (!source.loadAdjacent || !(await source.loadAdjacent(direction))) return;
    // The row at the next position among all, wherever the load put it: a
    // page's start moves with it, a feed grows in place.
    const offset = source.offset?.() ?? 0;
    const landed = source.rows()[global + direction - offset];
    if (landed) go(landed);
  };
  // Without a loader, the rows loaded are as far as the steps reach.
  const canLoad = !!source.loadAdjacent;
  return {
    index: global,
    total,
    hasPrev: local > 0 || (canLoad && global > 0),
    hasNext: local < rows.length - 1 || (canLoad && global < total - 1),
    prev: step(-1),
    next: step(1),
  };
}

const ROW_STEP_KEYS: Record<
  string,
  keyof Pick<RowNavigation, "prev" | "next">
> = { j: "next", k: "prev" };

// A key typed into a field is text, not a step.
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
