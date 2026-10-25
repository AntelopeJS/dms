import { computed, onMounted, ref, type ComputedRef, type Ref } from "vue";
import type { MatrixColumn } from "../../../types/matrix";
import {
  clampColumnWidth,
  isColumnHidden,
  matrixColumnWidth,
  matrixPreferencesKey,
  mergeMatrixColumns,
  moveColumnOrder,
  orderMatrixColumns,
  visibleMatrixColumns,
  type MatrixColumnPreferences,
} from "./matrixColumns";

export interface MatrixColumnsControls {
  /** Every column, block's and response's, in the order the user picked. */
  columns: ComputedRef<MatrixColumn[]>;
  /** The columns drawn: shown ones, pinned first. */
  visible: ComputedRef<MatrixColumn[]>;
  preferences: Ref<MatrixColumnPreferences>;
  columnById: ComputedRef<Map<string, MatrixColumn>>;
  widthOf: (column: MatrixColumn) => number;
  isHidden: (column: MatrixColumn) => boolean;
  toggle: (columnId: string) => void;
  move: (columnId: string, step: number) => void;
  /** A width dragged to: on screen at once, remembered by `saveWidths`. */
  resize: (columnId: string, width: number) => void;
  /** Remembers the widths on the device, once a drag ends. */
  saveWidths: () => void;
  reset: () => void;
}

function readPreferences(key: string): MatrixColumnPreferences {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as MatrixColumnPreferences) : {};
  } catch {
    return {};
  }
}

function writePreferences(key: string, value: MatrixColumnPreferences): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or refused (a private window): the choice lasts the visit.
  }
}

/**
 * The grid's columns: the block's merged with the response's, shown, hidden,
 * moved and resized by the user. Those choices are remembered on the device
 * per page and block, and read once mounted, so the server render and the
 * browser's first render agree.
 */
export function useMatrixColumns(
  declared: () => MatrixColumn[] | undefined,
  answered: () => MatrixColumn[] | undefined,
  pageId: string,
  componentId: string,
): MatrixColumnsControls {
  const storageKey = matrixPreferencesKey(pageId, componentId);
  const preferences = ref<MatrixColumnPreferences>({});
  onMounted(() => {
    preferences.value = readPreferences(storageKey);
  });
  const update = (patch: Partial<MatrixColumnPreferences>) => {
    preferences.value = { ...preferences.value, ...patch };
    writePreferences(storageKey, preferences.value);
  };

  const merged = computed(() => mergeMatrixColumns(declared(), answered()));
  const columns = computed(() =>
    orderMatrixColumns(merged.value, preferences.value.order),
  );
  const visible = computed(() =>
    visibleMatrixColumns(merged.value, preferences.value),
  );
  const columnById = computed(
    () => new Map(merged.value.map((column) => [column.id, column])),
  );

  return {
    columns,
    visible,
    preferences,
    columnById,
    widthOf: (column) => matrixColumnWidth(column, preferences.value),
    isHidden: (column) => isColumnHidden(column, preferences.value),
    toggle: (columnId) => {
      const column = columnById.value.get(columnId);
      if (!column) return;
      const hidden = isColumnHidden(column, preferences.value);
      update({ hidden: { ...preferences.value.hidden, [columnId]: !hidden } });
    },
    move: (columnId, step) =>
      update({ order: moveColumnOrder(columns.value, columnId, step) }),
    resize: (columnId, width) => {
      preferences.value = {
        ...preferences.value,
        widths: {
          ...preferences.value.widths,
          [columnId]: clampColumnWidth(width),
        },
      };
    },
    saveWidths: () => writePreferences(storageKey, preferences.value),
    reset: () => update({ order: [], hidden: {}, widths: {} }),
  };
}
