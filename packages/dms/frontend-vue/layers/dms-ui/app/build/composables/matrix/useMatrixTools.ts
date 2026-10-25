import { ref } from "vue";
import type { BlockText } from "#dms-core/app/types/composed-text";
import type {
  MatrixColumn,
  MatrixFillAction,
  MatrixFillResponse,
  MatrixOptions,
  MatrixRow,
} from "../../../types/matrix";
import { resolveUrlVariables } from "../../utils/urlVariables";
import { downloadTextFile, matrixCsv, matrixCsvFileName } from "./matrixCsv";
import type { MatrixSection } from "./matrixSections";
import type { MatrixTotalsResult } from "./matrixTotals";
import type { MatrixCommit } from "./matrixSaveEngine";

const CSV_TYPE = "text/csv;charset=utf-8";

export interface MatrixToolsOptions {
  options: MatrixOptions;
  componentId: string;
  text: (text: BlockText | undefined) => string;
  routeParams: () => Record<string, string> | undefined;
  rows: () => MatrixRow[];
  sections: () => MatrixSection[];
  visibleColumns: () => MatrixColumn[];
  /** Every column, hidden ones included. */
  allColumns: () => MatrixColumn[];
  valueOf: (row: MatrixRow, columnId: string) => unknown;
  rowTitle: (row: MatrixRow) => string;
  totals: () => MatrixTotalsResult;
  commitMany: (changes: MatrixCommit[]) => void;
  rowOf: (rowId: string) => MatrixRow | undefined;
  /** A select's value as its option reads. */
  labelOfValue: (column: MatrixColumn, value: unknown) => string | undefined;
}

/** A row as shown: its values with the edits not written yet. */
function shownRow(
  row: MatrixRow,
  columnIds: string[],
  valueOf: (row: MatrixRow, columnId: string) => unknown,
): MatrixRow {
  const values = { ...row.values };
  for (const columnId of new Set([...Object.keys(values), ...columnIds])) {
    const value = valueOf(row, columnId);
    if (value !== undefined) values[columnId] = value;
  }
  return { ...row, values };
}

/**
 * The toolbar's tools: the fills a route computes (the grid posts its rows as
 * shown and takes the answered changes as edits) and the CSV of the rows and
 * columns on screen.
 */
export function useMatrixTools(tools: MatrixToolsOptions) {
  const { $authFetch } = useAuthFetch();
  const route = useDmsRoute();
  const { t } = useI18n();
  const runningFill = ref<string | null>(null);

  async function runFill(action: MatrixFillAction): Promise<void> {
    const columnIds = tools.allColumns().map((column) => column.id);
    const url = resolveUrlVariables(action.url, {
      routeParams: tools.routeParams(),
      routeQuery: route.query as Record<string, unknown>,
    });
    if (!url || runningFill.value) return;
    runningFill.value = action.id;
    try {
      const response = await $authFetch<MatrixFillResponse>(url, {
        method: (action.method ?? "POST") as "POST",
        body: {
          rows: tools
            .rows()
            .map((row) => shownRow(row, columnIds, tools.valueOf)),
        },
      });
      applyFill(response?.changes ?? []);
    } catch (error) {
      useApiError(error, { title: t("dms.matrix.fill_failed") });
    } finally {
      runningFill.value = null;
    }
  }

  function applyFill(changes: NonNullable<MatrixFillResponse["changes"]>) {
    const commits: MatrixCommit[] = [];
    for (const change of changes) {
      const row = tools.rowOf(change.rowId);
      if (!row) continue;
      commits.push({ ...change, original: row.values[change.columnId] });
    }
    if (commits.length) tools.commitMany(commits);
  }

  function cellText(column: MatrixColumn, value: unknown): unknown {
    if (Array.isArray(value))
      return value
        .map((entry) => tools.labelOfValue(column, entry) ?? entry)
        .join(", ");
    return tools.labelOfValue(column, value) ?? value;
  }

  /** Downloads the rows on screen, by visible column, edits included. */
  function exportCsv(): void {
    const columns = tools.visibleColumns();
    const withTotals = tools.options.totals?.rows === true;
    const totalLabel =
      tools.text(tools.options.totals?.label) || t("dms.matrix.total");
    const header = [
      tools.text(tools.options.rowHeader?.label) || t("dms.matrix.row_header"),
      ...columns.map((column) => tools.text(column.label)),
      ...(withTotals ? [totalLabel] : []),
    ];
    const rows = tools.sections().flatMap((section) => section.rows);
    const totals = tools.totals();
    const lines = rows.map((row) => [
      tools.rowTitle(row),
      ...columns.map((column) =>
        cellText(column, tools.valueOf(row, column.id)),
      ),
      ...(withTotals ? [totals.rows[row.id] ?? 0] : []),
    ]);
    const title = tools.text(tools.options.title) || tools.componentId;
    downloadTextFile(
      matrixCsvFileName(title, new Date()),
      matrixCsv(header, lines),
      CSV_TYPE,
    );
  }

  return { runFill, runningFill, exportCsv };
}
