import { watch, type Ref } from "vue";

/** The attribute naming a body row's id, which the anchor finds it by. */
export const ROW_ID_ATTRIBUTE = "data-row-id";

const SCROLLABLE_OVERFLOW = /(auto|scroll)/;

/** The row the reader has at the top of the view, before an update. */
interface RowAnchor {
  id: string;
  row: Element;
  scroller: HTMLElement;
  /** Where the row stood, in viewport pixels. */
  top: number;
  /** Its position among the rows. */
  index: number;
  previousIds: ReadonlySet<string>;
}

/** The element the table scrolls in: itself, or its nearest scrolled ancestor. */
function findScroller(start: HTMLElement): HTMLElement | null {
  for (
    let element: HTMLElement | null = start;
    element;
    element = element.parentElement
  ) {
    if (
      SCROLLABLE_OVERFLOW.test(getComputedStyle(element).overflowY) &&
      element.scrollHeight > element.clientHeight
    )
      return element;
  }
  return null;
}

function captureAnchor(
  root: HTMLElement | null,
  ids: readonly string[],
): RowAnchor | null {
  if (!root) return null;
  const scroller = findScroller(root);

  if (!scroller || scroller.scrollTop <= 0) return null;
  const viewTop = scroller.getBoundingClientRect().top;
  for (const row of root.querySelectorAll(`tr[${ROW_ID_ATTRIBUTE}]`)) {
    const top = row.getBoundingClientRect().top;
    if (top < viewTop) continue;
    const id = row.getAttribute(ROW_ID_ATTRIBUTE)!;
    return {
      id,
      row,
      scroller,
      top,
      index: ids.indexOf(id),
      previousIds: new Set(ids),
    };
  }
  return null;
}

function isPrepend(anchor: RowAnchor, ids: readonly string[]): boolean {
  const index = ids.indexOf(anchor.id);
  if (anchor.index < 0 || index <= anchor.index) return false;
  const added = ids
    .slice(0, index)
    .filter((id) => !anchor.previousIds.has(id)).length;
  return added === index - anchor.index;
}

/**
 * Keeps the rows the reader is looking at where they are when rows are added
 * above them (a live list's new rows), by scrolling as far as the rows push
 * them, in the frame they land. The browser's own scroll anchoring does not
 * hold a table's rows. At the top of the list nothing is held: the new rows
 * show, as a live list means them to.
 *
 * @param root The table, whose body rows carry `ROW_ID_ATTRIBUTE`
 * @param rowIds The ids of the body rows, in order
 */
export function useRowScrollAnchor(
  root: Readonly<Ref<HTMLElement | null>>,
  rowIds: () => readonly string[],
): void {
  if (typeof window === "undefined") return;
  let anchor: RowAnchor | null = null;
  watch(
    rowIds,
    (_next, previous) => {
      anchor = captureAnchor(root.value, previous ?? []);
    },
    { flush: "pre" },
  );
  watch(
    rowIds,
    (next) => {
      const held = anchor;
      anchor = null;
      if (!held || !held.row.isConnected || !isPrepend(held, next)) return;
      const moved = held.row.getBoundingClientRect().top - held.top;
      if (moved !== 0) held.scroller.scrollTop += moved;
    },
    { flush: "post" },
  );
}
