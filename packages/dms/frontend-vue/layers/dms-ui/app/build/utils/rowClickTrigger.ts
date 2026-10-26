/**
 * What runs a row's click action (backend `TableViewRowClick`): a double-click
 * by default, or a single click.
 */
export type TableViewRowClick = "single" | "double";

/** A reason a pointer event on a row must not run its click action. */
type RowClickGuard = (event: MouseEvent) => boolean;

interface RowClickTrigger {
  eventType: string;
  guards: RowClickGuard[];
}

const DEFAULT_ROW_CLICK: TableViewRowClick = "double";

const ROW_CONTROL_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[role='button']",
  "[role='checkbox']",
  "[role='menuitem']",
  "[role='switch']",
  "[contenteditable='true']",
].join(", ");

const isRepeatClick: RowClickGuard = (event) => event.detail > 1;

const isOnRowControl: RowClickGuard = (event) => {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- EventTarget does not establish an Element. This legacy projection keeps optional closest access, including inert targets without that method, without validating the target.
  const target = event.target as Element | null;
  const control = target?.closest?.(ROW_CONTROL_SELECTOR);
  if (!control) return false;
  // SAFETY: The row listener is attached to the row element; a detached event has a null currentTarget.
  const row = event.currentTarget as Element | null;
  return !row || row.contains(control);
};

const endsTextSelection: RowClickGuard = () => {
  if (typeof window === "undefined") return false;
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && selection.toString() !== "";
};

const ROW_CLICK_TRIGGERS: Record<TableViewRowClick, RowClickTrigger> = {
  double: { eventType: "dblclick", guards: [] },
  single: {
    eventType: "click",
    guards: [isRepeatClick, isOnRowControl, endsTextSelection],
  },
};

/**
 * Whether `event`, a click or a double-click on a row, runs the row's click
 * action under the table's `rowClick` mode.
 */
export function isRowClickTrigger(
  mode: TableViewRowClick | undefined,
  event: MouseEvent,
): boolean {
  const trigger = ROW_CLICK_TRIGGERS[mode ?? DEFAULT_ROW_CLICK];
  if (!trigger || event.type !== trigger.eventType) return false;
  return !trigger.guards.some((guard) => guard(event));
}
