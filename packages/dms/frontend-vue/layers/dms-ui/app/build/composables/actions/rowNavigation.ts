import { get } from "@nuxt/ui/runtime/utils/index.js";

/**
 * What a drawer or modal opened on a row receives to step through the rows
 * the table shows (`navigation` prop): J and K do the same.
 */
export interface RowNavigation {
  /** Position of the row among the rows shown, from 0. */
  index: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  prev: () => void;
  next: () => void;
}

/** The rows a container steps through, in the order the table shows them. */
export interface RowNavigationSource {
  rows: () => Data[];
  rowIdKey: string;
}

const rowIdOf = (row: Data, rowIdKey: string): string =>
  String(get(row, rowIdKey));

/**
 * The navigation of `row` among the rows shown; `go` opens another row in
 * its place. Undefined when the row is not among them (opened from a link).
 */
export function rowNavigation(
  source: RowNavigationSource,
  row: Data,
  go: (row: Data) => void,
): RowNavigation | undefined {
  const rows = source.rows();
  const id = rowIdOf(row, source.rowIdKey);
  const index = rows.findIndex(
    (candidate) => rowIdOf(candidate, source.rowIdKey) === id,
  );
  if (index < 0) return undefined;
  const at = (position: number) => () => {
    const target = rows[position];
    if (target) go(target);
  };
  return {
    index,
    total: rows.length,
    hasPrev: index > 0,
    hasNext: index < rows.length - 1,
    prev: at(index - 1),
    next: at(index + 1),
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
