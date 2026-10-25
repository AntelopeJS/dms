import {
  computed,
  inject,
  markRaw,
  onMounted,
  provide,
  ref,
  watch,
  type ComputedRef,
  type InjectionKey,
  type Ref,
} from "vue";
import { useComposedText } from "#dms-core/app/composables/translation/useComposedText";
import type { BlockText } from "#dms-core/app/types/composed-text";
import type {
  MatrixCellState,
  MatrixColumn,
  MatrixOptions,
  MatrixRow,
  MatrixRowAction,
  MatrixSaveRequest,
  MatrixSaveResponse,
  MatrixTargets,
} from "../../../types/matrix";
import { resolveUrlVariables } from "../../utils/urlVariables";
import { resolveActionError } from "../confirm/actionError";
import { useActionTargets } from "../actions/useActionTargets";
import {
  createMatrixSaveEngine,
  type MatrixSaveEngine,
} from "./matrixSaveEngine";
import {
  computeMatrixTotals,
  matrixTargetMisses,
  mergeMatrixTargets,
  type MatrixTargetMisses,
  type MatrixTotalsResult,
} from "./matrixTotals";
import { isEmptyValue, kindOf, valueText } from "./matrixValues";
import type { MatrixRowGroup, MatrixSection } from "./matrixSections";
import {
  useMatrixColumns,
  type MatrixColumnsControls,
} from "./useMatrixColumns";
import { useMatrixData, type MatrixDataSource } from "./useMatrixData";
import { useMatrixDrawers } from "./useMatrixDrawers";
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
import { matrixFilterParams } from "./matrixQuery";
import { useMatrixSaving } from "./useMatrixSaving";
import { useMatrixSelection, type MatrixSelection } from "./useMatrixSelection";
import {
  matrixRowUrlKey,
  readMatrixUrlRow,
  writeMatrixUrlEntries,
} from "./matrixUrlState";

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
  valueOf: (row: MatrixRow, columnId: string) => unknown;
  cellState: (row: MatrixRow, columnId: string) => MatrixCellState;
  isEditable: (row: MatrixRow, column: MatrixColumn) => boolean;
  hasCellAction: (row: MatrixRow, column: MatrixColumn) => boolean;
  runCellAction: (row: MatrixRow, column: MatrixColumn) => void;
  commitValue: (row: MatrixRow, column: MatrixColumn, value: unknown) => void;
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

/**
 * Posts a request to `saveUrl`, with the list query the rows are read with
 * (no paging), so the route can answer the `counts` of the filtered view.
 */
function useSaveRequest(
  options: MatrixOptions,
  routeParams: () => Record<string, string> | undefined,
  listQuery: () => Record<string, string>,
) {
  // The block's mode goes with every save: a generic route reads it to know
  // whether to check each change's `previous`.
  const conflicts = options.conflicts ?? "overwrite";
  const { $authFetch } = useAuthFetch();
  const route = useDmsRoute();
  return async (
    request: MatrixSaveRequest,
  ): Promise<MatrixSaveResponse | null> => {
    const url = resolveUrlVariables(options.saveUrl, {
      routeParams: routeParams(),
      routeQuery: route.query as Record<string, unknown>,
    });
    if (!url) throw new Error("dms.matrix.save_unresolved");
    return $authFetch<MatrixSaveResponse>(url, {
      method: (options.saveUrlMethod ?? "POST") as "POST",
      body: { ...request, conflicts, query: listQuery() },
    });
  };
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
  const options = props;
  const { t } = useI18n();
  const { processText } = useComposedText();
  const root = ref<HTMLElement | null>(null);
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

  const targets = computed(() =>
    mergeMatrixTargets(options.targets, source.data.value?.targets),
  );
  // Read lazily: the engine is built before the totals that read its edits.
  let isBlockedNow = () => false;
  const engine = createMatrixSaveEngine({
    mode: () => options.saveMode ?? "immediate",
    send: useSaveRequest(options, routeParams, () =>
      matrixFilterParams(query.state.value),
    ),
    isBlocked: () => isBlockedNow(),
    onResponse: (response) => source.applySaveResponse(response),
    onWritten: (values) => source.patchValues(values),
    onConflict: (conflict) =>
      source.patchValues([
        {
          rowId: conflict.rowId,
          columnId: conflict.columnId,
          value: conflict.current,
        },
      ]),
    onSaved: (changes) => saving.offerUndo(changes),
    describeError: (error) =>
      resolveActionError(error, t, (field) => {
        const column = columns.columnById.value.get(field);
        return column ? text(column.label) : undefined;
      }),
  });

  const rows = useMatrixRows({
    data: source.data,
    grouping: () => options.grouping,
    groupOf: (row) => fieldGroupOf(row),
    stateKey: `dms-matrix-folds:${props.pageId}:${props.componentId}`,
    keepEditedRows: () => options.keepEditedRows === true,
    // Pages are not filters: a row edited on another page stays there.
    pageKey: () =>
      options.pagination === "pages" ? String(query.state.value.page) : "",
    touched: engine.touchedRows,
    hasEdit: (rowId) => engine.edits.value.some((edit) => edit.rowId === rowId),
  });

  const valueOf = (row: MatrixRow, columnId: string) =>
    engine.valueOf(row.id, columnId, row.values[columnId]);

  // A row naming no group joins the one of its stored value in
  // `groupByField`, its header that value as its column reads it: an edit
  // does not move the row before it is read again.
  function fieldGroupOf(row: MatrixRow): MatrixRowGroup | null {
    const field = options.grouping?.groupByField;
    if (!field) return null;
    const value = row.values[field];
    if (isEmptyValue(value))
      return { key: "", label: t("dms.matrix.group_none") };
    const column = columns.columnById.value.get(field);
    const label =
      (column && optionLabel(column, value, text)) ??
      (typeof value === "boolean"
        ? t(value ? "dms.matrix.yes" : "dms.matrix.no")
        : valueText(value));
    return { key: valueText(value), label };
  }
  const sectionTotals = (section: MatrixSection) =>
    computeMatrixTotals(section.rows, columns.columns.value, valueOf);
  const totals = computed(() =>
    computeMatrixTotals(rows.rows.value, columns.columns.value, valueOf),
  );
  const misses = computed(() =>
    matrixTargetMisses(targets.value, totals.value),
  );
  const isBlocked = computed(
    () => Boolean(targets.value?.blockSave) && misses.value.isMissed,
  );
  isBlockedNow = () => isBlocked.value;
  const targetMessage = computed(() => {
    if (!misses.value.isMissed) return null;
    return targets.value?.message
      ? text(targets.value.message)
      : t("dms.matrix.target_missed");
  });
  // Immediate edits held by a missed target go as soon as every one is met.
  watch(isBlocked, (blocked) => {
    if (!blocked && engine.heldCount.value > 0) void engine.flush();
  });

  const cellState = (row: MatrixRow, columnId: string): MatrixCellState =>
    row.cells?.[columnId] ?? {};
  const isEditable = (row: MatrixRow, column: MatrixColumn) => {
    if (!canEdit.value || column.editable === false || row.readOnly)
      return false;
    const state = cellState(row, column.id);
    return !state.disabled && !state.readOnly;
  };

  const { handleCustomRowAction } = useActionTargets({
    api: useAuthFetch().$authFetch,
    componentId: props.componentId,
    pageId: props.pageId,
    refreshCallback: () => void source.refresh(),
    handleApiError: (error, title) => useApiError(error, { title }),
    rowIdKey: "id",
  });
  const runRowAction = (action: MatrixRowAction, row: MatrixRow) =>
    handleCustomRowAction(
      { label: text(action.label), icon: action.icon, target: action.target },
      { ...row.values, id: row.id },
    );
  // An empty cell has nothing to act on: it is not clickable.
  const hasCellAction = (row: MatrixRow, column: MatrixColumn) =>
    Boolean(options.cellAction) &&
    !cellState(row, column.id).disabled &&
    !isEmptyValue(valueOf(row, column.id));
  const runCellAction = (row: MatrixRow, column: MatrixColumn) => {
    if (!options.cellAction) return;
    // `{{row.X}}` reads the row's values, plus its id, the column and the value.
    handleCustomRowAction(
      { label: text(column.label), target: options.cellAction },
      {
        ...row.values,
        id: row.id,
        column: column.id,
        value: valueOf(row, column.id),
      },
    );
  };

  const commitValue = (row: MatrixRow, column: MatrixColumn, value: unknown) =>
    void engine.commit({
      rowId: row.id,
      columnId: column.id,
      value,
      original: row.values[column.id],
    });

  const rowTitle = (row: MatrixRow) => (row.label ? text(row.label) : row.id);
  const hasRowPanel = computed(() => Boolean(options.rowPanel));
  const shape = (list: MatrixRow[]) => ({
    rowIds: list.map((row) => row.id),
    columnIds: columns.visible.value.map((column) => column.id),
  });

  // Filled once the context exists: the drawers hand it to their bodies.
  let context: MatrixContext | null = null;
  const drawers = useMatrixDrawers({
    context: () => context,
    componentId: props.componentId,
    shownRows: () => rows.shown.value,
    rowOf: (rowId) => rows.rowById.value.get(rowId),
    columnOf: (columnId) => columns.columnById.value.get(columnId),
    text,
    rowTitle,
    panelTitle: () =>
      typeof options.rowPanel === "object" ? options.rowPanel.title : undefined,
    onClosed: (address) => {
      if (address) interaction.focusCell(address);
    },
    onRowShown: (rowId) => {
      if (isRowDeepLinked)
        writeMatrixUrlEntries({ [matrixRowUrlKey(props.componentId)]: rowId });
    },
  });

  // `rowPanel.deepLink`: the open row is in the URL, and opened again once
  // the rows are there.
  const isRowDeepLinked =
    typeof options.rowPanel === "object" && options.rowPanel.deepLink === true;
  let linkedRow = isRowDeepLinked
    ? readMatrixUrlRow(
        useDmsRoute().query as Record<string, string>,
        props.componentId,
      )
    : undefined;
  onMounted(() => {
    if (!linkedRow) return;
    watch(
      () => rows.rowById.value,
      (byId) => {
        if (!linkedRow || !byId.has(linkedRow)) return;
        const rowId = linkedRow;
        linkedRow = undefined;
        drawers.openRowPanel(rowId);
      },
      { immediate: true },
    );
  });

  const interaction = useMatrixInteraction({
    options,
    root,
    shape: () => shape(rows.shown.value),
    allShape: () =>
      shape(rows.sections.value.flatMap((section) => section.rows)),
    rowOf: (rowId) => rows.rowById.value.get(rowId),
    columnOf: (columnId) => columns.columnById.value.get(columnId),
    valueOf,
    isEditable,
    hasCellAction,
    runCellAction,
    commitValue,
    openCellDrawer: drawers.openCellDrawer,
    openRowPanel: drawers.openRowPanel,
    hasRowPanel: () => hasRowPanel.value,
    expandGroupOf: rows.expandGroupOf,
    cellEditIn: (row, columnId) => cellState(row, columnId).editIn,
  });

  const entryCell = computed<MatrixCellAddress | null>(() => {
    const row = rows.shown.value[0];
    const column = columns.visible.value[0];
    return row && column ? { rowId: row.id, columnId: column.id } : null;
  });

  const saving = useMatrixSaving({
    options,
    engine,
    isBlocked,
    targetMessage,
    root,
    commitEditor: () => interaction.commitOpenEditor(),
    context: () => context as MatrixContext,
  });
  const selection = useMatrixSelection(() => rows.shown.value);

  const tools = useMatrixTools({
    options,
    componentId: props.componentId,
    text,
    routeParams,
    rows: () => rows.rows.value,
    sections: () => rows.sections.value,
    visibleColumns: () => columns.visible.value,
    allColumns: () => columns.columns.value,
    valueOf,
    rowTitle,
    totals: () => totals.value,
    commitMany: (changes) => void engine.commitMany(changes),
    rowOf: (rowId) => rows.rowById.value.get(rowId),
    columnOf: (columnId) => columns.columnById.value.get(columnId),
    isEditable,
    selected: () => (options.selectable ? selection.ids.value : undefined),
    labelOfValue: (column, value) => optionLabel(column, value, text),
  });

  // Raw: a drawer's options are made deeply reactive, which would unwrap the
  // context's refs for the bodies it is handed to.
  context = markRaw({
    options,
    componentId: props.componentId,
    pageId: props.pageId,
    root,
    text,
    query,
    source,
    columns,
    rows,
    engine,
    interaction,
    entryCell,
    canEdit,
    totals,
    sectionTotals,
    targets,
    misses,
    isBlocked,
    targetMessage,
    rowTitle,
    valueOf,
    cellState,
    isEditable,
    hasCellAction,
    runCellAction,
    commitValue,
    openRowPanel: drawers.openRowPanel,
    openCellDrawer: drawers.openCellDrawer,
    hasRowPanel,
    selection,
    runRowAction,
    requestSave: saving.requestSave,
    tools,
  });
  provide(MATRIX_CONTEXT, context);
  return context;
}

/** A select's value as its option's label; anything else as written. */
export function optionLabel(
  column: MatrixColumn,
  value: unknown,
  text: (value: BlockText | undefined) => string,
): string | undefined {
  if (kindOf(column) !== "select" && kindOf(column) !== "tags")
    return undefined;
  const option = column.options?.find((entry) => entry.value === value);
  return option ? text(option.label) : undefined;
}
