import { nextTick, onScopeDispose, ref } from "vue";
import {
  REORDER_ITEM_ATTRIBUTE,
  startDragPreview,
  type DragPreview,
} from "./dragPreview";
import type {
  TableViewDisplayReorder,
  TableViewReorderHandle,
} from "../../../composables/table-view/types/display";

const STEP_BY_KEY: Record<KeyboardEvent["key"], number> = {
  ArrowUp: -1,
  ArrowLeft: -1,
  ArrowDown: 1,
  ArrowRight: 1,
};

const DRAG_EFFECT = "move";

/** The look of a move handle, on a grid row and on a card. */
export const REORDER_HANDLE_CLASS =
  "inline-flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-dimmed hover:text-highlighted focus-visible:outline-2 focus-visible:outline-(--dms-accent-line) disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:size-4";

export interface ReorderHandlesOptions {
  reorder: () => TableViewDisplayReorder | undefined;
  /** How many rows the display draws: a step past either end does nothing. */
  count: () => number;
}

/** Where the dragged row lands next to the row under the pointer. */
export type DropSide = "before" | "after";

/**
 * The move handles of a hand-ordered display, the grid's and the cards'
 * alike: the row dragged by its handle is dropped on another row, and the
 * arrow keys on a handle move its row by one, keeping the focus on it.
 *
 * While a row moves, a copy of it follows the pointer and `dropSide` names
 * the row it would take the place of. Bind `REORDER_ITEM_ATTRIBUTE` on each
 * row's element: the copy is made from it.
 */
export function useReorderHandles(options: ReorderHandlesOptions) {
  const { t } = useI18n();
  const draggedIndex = ref<number | undefined>();
  const overIndex = ref<number | undefined>();
  let preview: DragPreview | undefined;

  const isEnabled = () => !!options.reorder()?.enabled;

  const follow = (event: DragEvent) => {
    overIndex.value = undefined;
    preview?.move(event.clientX, event.clientY);
  };

  const endDrag = () => {
    draggedIndex.value = undefined;
    overIndex.value = undefined;
    preview?.remove();
    preview = undefined;
    document.removeEventListener("dragover", follow, true);
  };

  onScopeDispose(() => {
    if (draggedIndex.value !== undefined) endDrag();
  });

  const drop = (index: number) => {
    const from = draggedIndex.value;
    endDrag();
    if (from !== undefined && isEnabled()) options.reorder()!.move(from, index);
  };

  const dragOver = (index: number, event: DragEvent) => {
    if (!isEnabled()) return;
    event.preventDefault();
    if (draggedIndex.value !== undefined) overIndex.value = index;
  };

  const dropSide = (index: number): DropSide | undefined => {
    const from = draggedIndex.value;
    if (from === undefined || overIndex.value !== index || from === index)
      return undefined;
    return index > from ? "after" : "before";
  };

  const step = (index: number, delta: number) => {
    const target = index + delta;
    if (!isEnabled() || target < 0 || target >= options.count()) return false;
    options.reorder()!.move(index, target);
    return true;
  };

  const startDrag = (index: number, event: DragEvent) => {
    endDrag();
    draggedIndex.value = index;
    const handle = event.currentTarget;
    const item =
      handle instanceof Element
        ? handle.closest<HTMLElement>(`[${REORDER_ITEM_ATTRIBUTE}]`)
        : null;
    if (item) preview = startDragPreview(item, event);
    document.addEventListener("dragover", follow, true);

    event.dataTransfer?.setData("text/plain", String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = DRAG_EFFECT;
  };

  const stepByKey = (index: number, event: KeyboardEvent) => {
    const delta = STEP_BY_KEY[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- EventTarget has no focus method, and the DOM event owner does not narrow currentTarget to the handle. A runtime HTMLElement check would change behavior for other focusable targets.
    const handle = event.currentTarget as HTMLElement | null;
    if (step(index, delta)) void nextTick(() => handle?.focus());
  };

  const handleFor = (index: number): TableViewReorderHandle => {
    const enabled = isEnabled();
    return {
      type: "button",
      draggable: enabled,
      disabled: !enabled,
      "aria-label": t("dms.table.reorder.move"),
      title: enabled
        ? t("dms.table.reorder.move")
        : t("dms.table.reorder.disabled"),
      onClick: (event) => event.stopPropagation(),
      onDragstart: (event) => startDrag(index, event),
      onDragend: endDrag,
      onKeydown: (event) => stepByKey(index, event),
    };
  };

  return { draggedIndex, dropSide, handleFor, drop, dragOver };
}
