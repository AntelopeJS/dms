import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { CodeBlock, KeyValueList } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { Matrix, type MatrixData } from "@antelopejs/interface-dms/base/matrix";
import { MATRIX_ALLOCATION_SLUG } from "../allocation/page";
import { matrixCategory, matrixPagePath } from "../category";
import { MATRIX_RECORDS_SLUG } from "../records/page";
import { MATRIX_ROSTER_SLUG } from "../roster/page";
import { MATRIX_STOCK_SLUG } from "../stock/page";
import { MATRIX_TRANSLATIONS_SLUG } from "../translations/page";

export const MATRIX_OPTIONS_SLUG = "matrix-options";

/** A Matrix option and the demo page that shows it. */
interface OptionEntry {
  option: string;
  text: string;
  /** The demo page's slug; none for an option no page sets. */
  page?: string;
}

const PAGE_NAMES: Record<string, string> = {
  [MATRIX_OPTIONS_SLUG]: "This page",
  [MATRIX_RECORDS_SLUG]: "Records",
  [MATRIX_TRANSLATIONS_SLUG]: "Translations",
  [MATRIX_STOCK_SLUG]: "Stock",
  [MATRIX_ALLOCATION_SLUG]: "Allocation",
  [MATRIX_ROSTER_SLUG]: "Roster",
};

function optionList(title: string, entries: OptionEntry[]) {
  return KeyValueList({
    title,
    dense: true,
    items: entries.map(({ option, text, page }) => ({
      label: option,
      value: text,
      detail: page ? PAGE_NAMES[page] : "Not shown in a demo",
      to: page ? matrixPagePath(page) : undefined,
    })),
  });
}

const QUARTERS: MatrixData = {
  columns: [
    { id: "q1", label: "Q1", kind: "number", align: "end" },
    { id: "q2", label: "Q2", kind: "number", align: "end" },
    { id: "q3", label: "Q3", kind: "number", align: "end" },
    {
      id: "q4",
      label: "Q4",
      kind: "number",
      align: "end",
      badge: "Forecast",
      badgeTone: "info",
    },
  ],
  rows: [
    {
      id: "LG4",
      label: "LG4",
      description: "Liège Médiacité",
      values: { q1: 182, q2: 205, q3: 171, q4: 240 },
      tone: "primary",
    },
    {
      id: "NE1",
      label: "NE1",
      description: "Namur Esplanade",
      values: { q1: 131, q2: 144, q3: 120, q4: 166 },
    },
    {
      id: "LUX29",
      label: "LUX29",
      description: "Luxembourg Cloche d'Or",
      values: { q1: 96, q2: 88, q3: 74, q4: 110 },
      cells: { q3: { tone: "error", issues: ["Below the 80 k€ floor"] } },
    },
    {
      id: "WEB",
      label: "WEB",
      description: "E-shop",
      values: { q1: 210, q2: 236, q3: 251, q4: 320 },
      cells: { q4: { hint: "+27 %" } },
    },
  ],
  footer: "Revenue in thousands of euros, 2026.",
};

const DECLARATION = `static revenue = Matrix({
  title: "Revenue by quarter (k€)",
  staticData: QUARTERS, // or fetchUrl: "/api/…" answering MatrixData
  rowHeader: { label: "Store" },
  totals: { rows: true, columns: true },
  crossHighlight: true,
  legend: [{ label: "Below the floor", tone: "error" }],
});

// Editable: add a route receiving { changes: [{ rowId, columnId, value, previous }] }
// and answering { rows?, errors?, conflicts? }.
static stock = Matrix({ fetchUrl, saveUrl, editTrigger: "click", saveMode: "staged" });`;

@RegisterPage()
export class PageMatrixOptions extends PageController(
  MATRIX_OPTIONS_SLUG,
  {
    displayName: "Matrix — overview",
    icon: "i-ph-grid-nine",
    category: matrixCategory,
    order: 0,
    description:
      "The Matrix block: a grid of rows by columns read and edited in place. A small read-only one from static data, its declaration, and every option with the page that demonstrates it.",
  },
  DefaultLayout(),
) {
  static revenue = Matrix({
    title: "Revenue by quarter (k€)",
    description:
      "staticData: no route. Totals both ways, a cross highlight, server-side cell states.",
    staticData: QUARTERS,
    rowHeader: { label: "Store", width: 200 },
    totals: { rows: true, columns: true },
    crossHighlight: true,
    legend: [
      { label: "Your store", tone: "primary" },
      { label: "Below the floor", tone: "error" },
    ],
  });

  static declaration = CodeBlock({
    title: "Declaring it",
    language: "typescript",
    code: DECLARATION,
  });

  static data = optionList("Data", [
    {
      option: "fetchUrl / staticData",
      text: "Where the rows come from: a route answering MatrixData, or the options themselves.",
      page: MATRIX_OPTIONS_SLUG,
    },
    {
      option: "columns",
      text: "Declared on the block (kind, width, min / max, integer, nullable, required, options of a select).",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "columns from the response",
      text: "The route adds the columns it alone knows (languages, sizes) and wins for an id both declare.",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "column badge / progress",
      text: "A pill and a meter under a header (Base, 12 missing, coverage).",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "column display",
      text: "A table view cell display drawing a read-only value (status_pill).",
      page: MATRIX_STOCK_SLUG,
    },
    {
      option: "column hidden / pinned",
      text: "Hidden until shown from the columns menu; stuck after the row header.",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "rowHeader",
      text: "The sticky first column: its label, width, and row numbers across pages (numbers).",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "row description / tone / group",
      text: "A dimmed line under the label, a highlighted row, the group it is filed under.",
      page: MATRIX_ROSTER_SLUG,
    },
    {
      option: "cell tone / hint / disabled",
      text: "Server-side cell states: an alert tone, a small figure in the corner, a hatched cell.",
      page: MATRIX_STOCK_SLUG,
    },
    {
      option: "cell placeholder / issues",
      text: "The base text greyed in an empty cell; warnings on a cell.",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "cell previous",
      text: "The old value struck through before the new one.",
      page: MATRIX_ALLOCATION_SLUG,
    },
    {
      option: "realtimeTopic",
      text: "Reads the route again on each event of the topics, as every block does.",
    },
  ]);

  static editing = optionList("Editing", [
    {
      option: "saveUrl / editable",
      text: "Where edits are written ({ changes } → { rows, errors, conflicts }); no saveUrl, no editing.",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "editTrigger: doubleClick",
      text: "A click selects, a double click or Enter edits.",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "editTrigger: click",
      text: "A click edits.",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "typeToEdit",
      text: "Typing on a selected cell starts editing with that character.",
      page: MATRIX_ALLOCATION_SLUG,
    },
    {
      option: "editIn (auto)",
      text: "json, code, keyValue and long texts are edited in a drawer.",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "saveMode: staged",
      text: "Edits kept, the old value struck through, written together from a save bar.",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "review / undoSeconds",
      text: "Lists before → after before writing; an Undo after the save.",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "saveMode: immediate",
      text: "Each cell written as it is left (Saving → Saved, Retry).",
      page: MATRIX_ROSTER_SLUG,
    },
    {
      option: "conflicts: detect",
      text: "The route answers a conflict when the value moved; Overwrite or Discard.",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "enterMove",
      text: "Where Enter goes after saving: down, right, or stay.",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "errors",
      text: "Per-cell and per-row refusals of the route, kept in the cell with the message.",
      page: MATRIX_ROSTER_SLUG,
    },
    {
      option: "rowPanel",
      text: "A row in a drawer, one field per column, with a JSON tab (showJson).",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "cellAction",
      text: "What a click on a read-only cell opens, {{row.id}} and {{row.column}} filled.",
      page: MATRIX_STOCK_SLUG,
    },
    {
      option: "fillActions",
      text: "Server-computed fills: the rows posted, the { changes } applied as edits.",
      page: MATRIX_ALLOCATION_SLUG,
    },
    {
      option: "targets (blockSave)",
      text: "Expected totals; a missed one turns red and holds the save.",
      page: MATRIX_ALLOCATION_SLUG,
    },
  ]);

  static navigation = optionList("Reading and filtering", [
    {
      option: "pagination: pages",
      text: "Server paging with pageSize and the pageSizes offered.",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "pagination: infinite",
      text: "The next rows read while scrolling.",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "sortable",
      text: "Header clicks send sort and direction.",
      page: MATRIX_RECORDS_SLUG,
    },
    { option: "search", text: "Sent as search.", page: MATRIX_RECORDS_SLUG },
    {
      option: "facets",
      text: "Select filters sent as facet_<id>=a,b, choices static or answered.",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "statusFilters",
      text: "Segments sent as status=<id>, with the response's counts.",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "grouping (server groups)",
      text: "Each row names its group, the response's groups describe them; collapsible, counted, collapsed past a row count.",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "grouping.groupByField",
      text: "Rows grouped on a column's value, the route listing them sorted on it.",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "grouping.subtotals",
      text: "With totals.columns, each group header carries its own column sums.",
      page: MATRIX_STOCK_SLUG,
    },
    {
      option: "jumpToEmpty / keepEditedRows",
      text: "N / Shift+N to the next empty cell; edited rows kept on screen after they stop matching.",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "urlState",
      text: "Page, search, status and facets kept in the page URL (on by default).",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
  ]);

  static display = optionList("Display", [
    {
      option: "totals",
      text: "A Total column, a Total row, or both; excludeFromTotals leaves a column out.",
      page: MATRIX_STOCK_SLUG,
    },
    {
      option: "crossHighlight",
      text: "Lights the hovered cell's row and column.",
      page: MATRIX_STOCK_SLUG,
    },
    {
      option: "legend",
      text: "Entries under the grid, a tone or the hatching.",
      page: MATRIX_ROSTER_SLUG,
    },
    {
      option: "columnsMenu / resizableColumns",
      text: "Show, hide, reorder and resize the columns, remembered on the device.",
      page: MATRIX_RECORDS_SLUG,
    },
    {
      option: "exportCsv",
      text: "The rows shown as a CSV file.",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "footer",
      text: "A line the route answers under the grid.",
      page: MATRIX_TRANSLATIONS_SLUG,
    },
    {
      option: "density / maxHeight / emptyLabel",
      text: "Row height, a scrolling height, the words of an empty grid.",
      page: MATRIX_RECORDS_SLUG,
    },
  ]);
}
