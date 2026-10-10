import { nextTick, ref } from "vue";
import type {
  TableViewDisplayReorder,
  TableViewReorderHandle,
} from "../../../composables/table-view/types/display";

// One place back or forward: a row of the grid steps up and down, a card of
// the cards grid also left and right.
const STEP_BY_KEY: Record<string, number> = {
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

/**
 * The move handles of a hand-ordered display, the grid's and the cards'
 * alike: the row dragged by its handle is dropped on another row, and the
 * arrow keys on a handle move its row by one, keeping the focus on it.
 */
export function useReorderHandles(options: ReorderHandlesOptions) {
  const { t } = useI18n();
  const draggedIndex = ref<number | undefined>();

  const isEnabled = () => !!options.reorder()?.enabled;

  const drop = (index: number) => {
    const from = draggedIndex.value;
    draggedIndex.value = undefined;
    if (from !== undefined && isEnabled()) options.reorder()!.move(from, index);
  };

  const allowDrop = (event: DragEvent) => {
    if (isEnabled()) event.preventDefault();
  };

  const step = (index: number, delta: number) => {
    const target = index + delta;
    if (!isEnabled() || target < 0 || target >= options.count()) return false;
    options.reorder()!.move(index, target);
    return true;
  };

  const startDrag = (index: number, event: DragEvent) => {
    draggedIndex.value = index;
    // Firefox starts a drag only once it carries data.
    event.dataTransfer?.setData("text/plain", String(index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = DRAG_EFFECT;
  };

  // The handle moves with its row (rows are keyed by id), and the browser
  // drops the focus of an element it moves: give it back.
  const stepByKey = (index: number, event: KeyboardEvent) => {
    const delta = STEP_BY_KEY[event.key];
    if (delta === undefined) return;
    event.preventDefault();
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
      onDragend: () => {
        draggedIndex.value = undefined;
      },
      onKeydown: (event) => stepByKey(index, event),
    };
  };

  return { draggedIndex, handleFor, drop, allowDrop };
}
