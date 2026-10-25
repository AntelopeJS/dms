import { computed, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import type {
  MatrixData,
  MatrixGrouping,
  MatrixRow,
} from "../../../types/matrix";
import {
  buildMatrixSections,
  initiallyCollapsed,
  isFoldable,
  shownRows,
  type MatrixRowGroupOf,
  type MatrixSection,
} from "./matrixSections";

export interface MatrixRowsControls {
  /** Every row on screen: the answer's, then the edited ones it dropped. */
  rows: ComputedRef<MatrixRow[]>;
  sections: ComputedRef<MatrixSection[]>;
  /** The rows drawn, folded groups left out: what the focus moves through. */
  shown: ComputedRef<MatrixRow[]>;
  rowById: ComputedRef<Map<string, MatrixRow>>;
  /** A header click folds and unfolds its group. */
  isFoldable: ComputedRef<boolean>;
  isCollapsed: (groupKey: string) => boolean;
  toggleGroup: (groupKey: string) => void;
  /** Unfolds the group a row is in (a jump or a step landing in it). */
  expandGroupOf: (rowId: string) => void;
  /** Edited rows kept on screen though the answer no longer lists them. */
  keptIds: ComputedRef<Set<string>>;
  /** Lets the kept rows go, except those still holding an edit. */
  hideKept: () => void;
}

export interface MatrixRowsOptions {
  data: ComputedRef<MatrixData | null>;
  grouping: () => MatrixGrouping | undefined;
  /** The group of a row naming none, from `groupByField`. */
  groupOf: MatrixRowGroupOf;
  /** Where the folds are kept while the page stays open. */
  stateKey: string;
  keepEditedRows: () => boolean;
  /** Rows edited in this view (the save engine's). */
  touched: Set<string>;
  /** A row still holding an edit, never let go. */
  hasEdit: (rowId: string) => boolean;
}

/** The groups folded, and the ones that took their initial state already. */
interface MatrixFoldState {
  folded: string[];
  seen: string[];
}

/** The rows a touched row is remembered by: as last read. */
function useKeptRows(
  options: MatrixRowsOptions,
  answered: ComputedRef<MatrixRow[]>,
) {
  const kept: Ref<Map<string, MatrixRow>> = shallowRef(new Map());
  watch(
    [answered, () => options.touched.size],
    ([rows]) => {
      if (!options.keepEditedRows()) return;
      const next = new Map(kept.value);
      for (const row of rows) {
        if (options.touched.has(row.id)) next.set(row.id, row);
      }
      kept.value = next;
    },
    { immediate: true },
  );
  const answeredIds = computed(
    () => new Set(answered.value.map((row) => row.id)),
  );
  const keptIds = computed(
    () =>
      new Set(
        [...kept.value.keys()].filter((id) => !answeredIds.value.has(id)),
      ),
  );
  const keptRows = computed(() =>
    [...keptIds.value].map((id) => kept.value.get(id) as MatrixRow),
  );
  const hideKept = () => {
    const next = new Map<string, MatrixRow>();
    for (const [id, row] of kept.value) {
      if (options.hasEdit(id)) next.set(id, row);
      else options.touched.delete(id);
    }
    kept.value = next;
  };
  return { keptIds, keptRows, hideKept };
}

/**
 * The rows of the grid under their group headers, folded and unfolded (the
 * folds kept while the page stays open), and with `keepEditedRows` the rows
 * edited in this view that a later read no longer lists (a status filter
 * they left): kept on screen, as last read, until the user hides them.
 */
export function useMatrixRows(options: MatrixRowsOptions): MatrixRowsControls {
  const answered = computed(() => options.data.value?.rows ?? []);
  const { keptIds, keptRows, hideKept } = useKeptRows(options, answered);
  const rows = computed(() => [...answered.value, ...keptRows.value]);
  const sections = computed(() =>
    buildMatrixSections(
      rows.value,
      options.data.value?.groups,
      options.grouping()?.groupByField ? options.groupOf : undefined,
    ),
  );

  const folds = useDmsState<MatrixFoldState>(options.stateKey, () => ({
    folded: [],
    seen: [],
  }));
  // Each group takes its initial state once, when it first shows.
  watch(
    sections,
    (next) => {
      const seen = new Set(folds.value.seen);
      const fresh = next.filter(
        (section) => section.group && !seen.has(section.key),
      );
      if (!fresh.length) return;
      const toFold = initiallyCollapsed(
        fresh,
        options.grouping(),
        // The rows the query matches, past the ones read so far.
        options.data.value?.total ?? rows.value.length,
      );
      folds.value = {
        folded: [...new Set([...folds.value.folded, ...toFold])],
        seen: [...seen, ...fresh.map((section) => section.key)],
      };
    },
    { immediate: true },
  );
  const folded = computed(() => new Set(folds.value.folded));
  const setFolded = (key: string, isFolded: boolean) => {
    const next = new Set(folds.value.folded);
    if (isFolded) next.add(key);
    else next.delete(key);
    folds.value = { ...folds.value, folded: [...next] };
  };

  const rowById = computed(
    () => new Map(rows.value.map((row) => [row.id, row])),
  );
  const sectionOfRow = (rowId: string) =>
    sections.value.find((section) =>
      section.rows.some((row) => row.id === rowId),
    );

  return {
    rows,
    sections,
    shown: computed(() => shownRows(sections.value, folded.value)),
    rowById,
    isFoldable: computed(() => isFoldable(options.grouping(), sections.value)),
    isCollapsed: (key) => folded.value.has(key),
    toggleGroup: (key) => setFolded(key, !folded.value.has(key)),
    expandGroupOf: (rowId) => {
      const section = sectionOfRow(rowId);
      if (section?.group && folded.value.has(section.key))
        setFolded(section.key, false);
    },
    keptIds,
    hideKept,
  };
}
