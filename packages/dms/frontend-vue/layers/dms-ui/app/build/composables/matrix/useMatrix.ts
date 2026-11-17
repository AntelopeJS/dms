import {
  computed,
  inject,
  markRaw,
  provide,
  ref,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from "vue";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
import type { BlockText } from "#dms-core/app/types/composed-text";
import { isBoolean } from "#dms-core/app/utils/type-check";
import type {
  MatrixCellState,
  MatrixChange,
  MatrixColumn,
  MatrixOptions,
  MatrixRow,
  MatrixRowAction,
  MatrixTargets,
  MatrixValue,
} from "../../../types/matrix";
import { rowPanelOptionsOf } from "../../../types/matrix";
import { detach } from "../detach";
import type { MatrixSaveEngine } from "./matrixSaveEngine";
import type { MatrixTargetMisses, MatrixTotalsResult } from "./matrixTotals";
import { isEmptyValue, kindOf, valueText } from "./matrixValues";
import type { MatrixRowGroup, MatrixSection } from "./matrixSections";
import {
  useMatrixColumns,
  type MatrixColumnsControls,
} from "./useMatrixColumns";
import { useMatrixData, type MatrixDataSource } from "./useMatrixData";
import { useMatrixDrawers } from "./useMatrixDrawers";
import { useMatrixEngine } from "./useMatrixEngine";
import { useMatrixCells } from "./useMatrixCells";
import { useMatrixTargets } from "./useMatrixTargets";
import { useMatrixRowLink } from "./useMatrixRowLink";
import {
  useMatrixInteraction,
  type MatrixEditing,
  type MatrixInteraction,
} from "./useMatrixInteraction";
import type { MatrixCellAddress } from "./matrixNavigation";
import {
  useMatrixQueryState,
  type MatrixQueryControls,
} from "./useMatrixQueryState";
import { useMatrixRows, type MatrixRowsControls } from "./useMatrixRows";
import { useMatrixTools } from "./useMatrixTools";
import { acceptsColumnFilter } from "./matrixColumns";
import { matrixFilterParams } from "./matrixQuery";
import { useMatrixSaving } from "./useMatrixSaving";
import { useMatrixSelection, type MatrixSelection } from "./useMatrixSelection";

/** Everything the grid's parts read and call, provided by the block. */
export interface MatrixContext {
  options: MatrixOptions;
  componentId: string;
  pageId: string;
  root: Ref<HTMLElement | null>;
  text: (text: BlockText | undefined) => string;
  query: MatrixQueryControls;
  source: MatrixDataSource;
  columns: MatrixColumnsControls;
  rows: MatrixRowsControls;
  engine: MatrixSaveEngine;
  interaction: MatrixInteraction;
  /** Where the keyboard enters the grid while no cell has the focus. */
  entryCell: ComputedRef<MatrixCellAddress | null>;
  /** Editing is on: a `saveUrl`, and `editable` not turned off. */
  canEdit: ComputedRef<boolean>;
  totals: ComputedRef<MatrixTotalsResult>;
  /** A group's own column sums (`grouping.subtotals`). */
  sectionTotals: (section: MatrixSection) => MatrixTotalsResult;
  /** The block's targets with the route's. */
  targets: ComputedRef<MatrixTargets | undefined>;
  misses: ComputedRef<MatrixTargetMisses>;
  /** A `blockSave` target is missed: nothing is written. */
  isBlocked: ComputedRef<boolean>;
  targetMessage: ComputedRef<string | null>;
  rowTitle: (row: MatrixRow) => string;
  valueOf: (row: MatrixRow, columnId: string) => MatrixValue | undefined;
  cellState: (row: MatrixRow, columnId: string) => MatrixCellState;
  isEditable: (row: MatrixRow, column: MatrixColumn) => boolean;
  hasCellAction: (row: MatrixRow, column: MatrixColumn) => boolean;
  runCellAction: (row: MatrixRow, column: MatrixColumn) => void;
  commitValue: (
    row: MatrixRow,
    column: MatrixColumn,
    value: MatrixValue,
  ) => void;
  openRowPanel: (rowId: string) => void;
  openCellDrawer: (address: MatrixCellAddress, editing?: MatrixEditing) => void;
  hasRowPanel: ComputedRef<boolean>;
  /** The rows checked in a `selectable` grid. */
  selection: MatrixSelection;
  /** Runs an action of a row's header menu. */
  runRowAction: (action: MatrixRowAction, row: MatrixRow) => void;
  /** The save bar and Ctrl+S: the review first when `review` is on. */
  requestSave: () => Promise<void>;
  tools: ReturnType<typeof useMatrixTools>;
}

const MATRIX_CONTEXT: InjectionKey<MatrixContext> = Symbol("dms-matrix");

export function useMatrixContext(): MatrixContext {
  const context = inject(MATRIX_CONTEXT);
  if (!context) throw new Error("A Matrix part is used outside its block.");
  return context;
}

/** What the block hands `useMatrix`: its options and where it stands. */
export interface MatrixSetup extends MatrixOptions {
  componentId: string;
  pageId: string;
  routeParams?: Record<string, string>;
}

/** The group a row falls in on `grouping.groupByField`, by its value there. */
function useRowGroups(
  options: MatrixOptions,
  columns: MatrixColumnsControls,
  text: (value: BlockText | undefined) => string,
) {
  const { t } = useI18n();
  return (row: MatrixRow): MatrixRowGroup | null => {
    const field = options.grouping?.groupByField;
    if (!field) return null;
    const value = row.values[field];
    if (isEmptyValue(value))
      return { key: "", label: t("dms.matrix.group_none") };
    const column = columns.columnById.value.get(field);
    const label =
      (column && optionLabel(column, value, text)) ??
      (isBoolean(value)
        ? t(value ? "dms.matrix.yes" : "dms.matrix.no")
        : valueText(value));
    return { key: valueText(value), label };
  };
}

/**
 * What the grid holds: rows read under the query, columns merged and
 * arranged, edits through the save engine, totals and targets, and what
 * each cell allows. `onSaved` is told each change a save wrote.
 */
function useMatrixModel(
  props: MatrixSetup,
  watchKey: () => string,
  onSaved: (changes: MatrixChange[]) => void,
) {
  const options = props;
  const { processText } = useComposedText();
  const text = (value: BlockText | undefined) =>
    value === undefined || value === "" ? "" : processText(value);
  const routeParams = () => props.routeParams;
  const query = useMatrixQueryState(options, props.componentId);
  const source = useMatrixData({
    options,
    query: query.state,
    routeParams,
    watchKey,
  });
  const columns = useMatrixColumns(
    () => options.columns,
    () => source.data.value?.columns,
    props.pageId,
    props.componentId,
  );
  const canEdit = computed(
    () => Boolean(options.saveUrl) && options.editable !== false,
  );
  let isBlockedNow = () => false;
  const engine = useMatrixEngine({
    options,
    routeParams,
    listQuery: () => matrixFilterParams(query.state.value),
    source,
    labelOf: (columnId) => {
      const column = columns.columnById.value.get(columnId);
      return column ? text(column.label) : undefined;
    },
    isBlocked: () => isBlockedNow(),
    onSaved,
  });
  const rows = useMatrixRows({
    data: source.data,
    grouping: () => options.grouping,
    groupOf: useRowGroups(options, columns, text),
    stateKey: `dms-matrix-folds:${props.pageId}:${props.componentId}`,
    keepEditedRows: () => options.keepEditedRows === true,
    view: () => ({
      filterKey: JSON.stringify(matrixFilterParams(query.state.value)),
      pageKey:
        options.pagination === "pages" ? String(query.state.value.page) : "",
    }),
    touched: engine.touchedRows,
    hasEdit: (rowId) => engine.edits.value.some((edit) => edit.rowId === rowId),
  });
  const valueOf = (row: MatrixRow, columnId: string) =>
    engine.valueOf(row.id, columnId, row.values[columnId]);
  const goals = useMatrixTargets({
    options,
    source,
    rows,
    columns,
    valueOf,
    text,
    engine,
  });
  isBlockedNow = () => goals.isBlocked.value;
  const cells = useMatrixCells({
    options,
    componentId: props.componentId,
    pageId: props.pageId,
    canEdit,
    valueOf,
    text,
    engine,
    refresh: () => source.refresh(),
  });
  watch(
    () => columns.columnById.value,
    (byId) => {
      if (!source.data.value) return;
      query.pruneColumnFilters((columnId) => {
        const column = byId.get(columnId);
        return (
          !!column &&
          acceptsColumnFilter(columnId, options.columnFilters, column)
        );
      });
    },
  );
  return {
    options,
    componentId: props.componentId,
    pageId: props.pageId,
    text,
    routeParams,
    query,
    source,
    columns,
    rows,
    engine,
    canEdit,
    valueOf,
    ...goals,
    ...cells,
  };
}

type MatrixModel = ReturnType<typeof useMatrixModel>;

/** The grid's drawers, the row kept in the URL, and its keyboard. */
function useMatrixView(
  model: MatrixModel,
  root: Ref<HTMLElement | null>,
  context: () => MatrixContext | null,
) {
  const { options, rows, columns, text } = model;
  const rowTitle = (row: MatrixRow) => (row.label ? text(row.label) : row.id);
  const focusOrderOf = (list: MatrixRow[]) => ({
    rowIds: list.map((row) => row.id),
    columnIds: columns.visible.value.map((column) => column.id),
  });
  const link = useMatrixRowLink({
    componentId: model.componentId,
    isDeepLinked: rowPanelOptionsOf(options.rowPanel)?.deepLink === true,
    rowById: () => rows.rowById.value,
    isLoading: () => model.source.isLoading.value,
    hasData: () => Boolean(model.source.data.value),
    openRowPanel: (rowId) => drawers.openRowPanel(rowId),
  });
  const drawers = useMatrixDrawers({
    context,
    componentId: model.componentId,
    shownRows: () => rows.shown.value,
    rowOf: (rowId) => rows.rowById.value.get(rowId),
    columnOf: (columnId) => columns.columnById.value.get(columnId),
    text,
    rowTitle,
    panelTitle: () => rowPanelOptionsOf(options.rowPanel)?.title,
    onClosed: (address) => {
      if (address) interaction.focusCell(address);
    },
    onRowShown: link.onRowShown,
  });
  const interaction = useMatrixInteraction({
    options,
    root,
    focusOrder: () => focusOrderOf(rows.shown.value),
    allFocusOrder: () =>
      focusOrderOf(rows.sections.value.flatMap((section) => section.rows)),
    rowOf: (rowId) => rows.rowById.value.get(rowId),
    columnOf: (columnId) => columns.columnById.value.get(columnId),
    valueOf: model.valueOf,
    isEditable: model.isEditable,
    hasCellAction: model.hasCellAction,
    runCellAction: model.runCellAction,
    commitValue: model.commitValue,
    openCellDrawer: drawers.openCellDrawer,
    openRowPanel: drawers.openRowPanel,
    hasRowPanel: () => Boolean(options.rowPanel),
    expandGroupOf: rows.expandGroupOf,
    cellEditIn: (row, columnId) => model.cellState(row, columnId).editIn,
  });
  return { rowTitle, drawers, interaction };
}

/**
 * The Matrix block's state and behaviour, provided to its parts: rows read
 * from `fetchUrl` or `staticData` under the query (URL-kept), columns merged
 * and arranged, edits through the save engine (immediate or staged, review,
 * undo, conflicts, targets), totals, the keyboard, the drawers and tools.
 */
export function useMatrix(
  props: MatrixSetup,
  /** The state of the block's watch actions: a change reads the rows again. */
  watchKey: () => string,
): MatrixContext {
  const model = useMatrixModel(props, watchKey, (changes) =>
    saving.offerUndo(changes),
  );
  const { options, rows, columns, engine } = model;
  const root = ref<HTMLElement | null>(null);
  let context: MatrixContext | null = null;
  const { rowTitle, drawers, interaction } = useMatrixView(
    model,
    root,
    () => context,
  );
  const entryCell = computed<MatrixCellAddress | null>(() => {
    const row = rows.shown.value[0];
    const column = columns.visible.value[0];
    return row && column ? { rowId: row.id, columnId: column.id } : null;
  });
  const saving = useMatrixSaving({
    options,
    engine,
    isBlocked: model.isBlocked,
    targetMessage: model.targetMessage,
    root,
    commitEditor: () => interaction.commitOpenEditor(),
    context: () => context,
  });
  const selection = useMatrixSelection(() => rows.shown.value);
  watch(
    () => rows.shown.value.map((row) => row.id),
    (ids) => selection.keepOnly(ids),
  );
  const tools = useMatrixTools({
    options,
    componentId: props.componentId,
    text: model.text,
    routeParams: model.routeParams,
    rows: () => rows.rows.value,
    sections: () => rows.sections.value,
    visibleColumns: () => columns.visible.value,
    allColumns: () => columns.columns.value,
    valueOf: model.valueOf,
    rowTitle,
    totals: () => model.totals.value,
    commitMany: (changes) => detach(engine.commitMany(changes)),
    rowOf: (rowId) => rows.rowById.value.get(rowId),
    columnOf: (columnId) => columns.columnById.value.get(columnId),
    isEditable: model.isEditable,
    selected: () => (options.selectable ? selection.ids.value : undefined),
    labelOfValue: (column, value) => optionLabel(column, value, model.text),
  });
  context = markRaw({
    ...model,
    root,
    interaction,
    entryCell,
    rowTitle,
    openRowPanel: drawers.openRowPanel,
    openCellDrawer: drawers.openCellDrawer,
    hasRowPanel: computed(() => Boolean(options.rowPanel)),
    selection,
    requestSave: saving.requestSave,
    tools,
  });
  provide(MATRIX_CONTEXT, context);
  return context;
}

/** A select's value as its option's label; anything else as written. */
export function optionLabel(
  column: MatrixColumn,
  value: MatrixValue | undefined,
  text: (value: BlockText | undefined) => string,
): string | undefined {
  if (kindOf(column) !== "select" && kindOf(column) !== "tags")
    return undefined;
  const option = column.options?.find((entry) => entry.value === value);
  return option ? text(option.label) : undefined;
}
