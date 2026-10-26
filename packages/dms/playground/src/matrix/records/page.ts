import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { Matrix } from "@antelopejs/interface-dms/base/matrix";
import type {
  MatrixColumn,
  MatrixSelectOption,
} from "@antelopejs/interface-dms/base/matrix-types";
import { demoGuide } from "../../table-view/guide";
import { MATRIX_API, matrixCategory } from "../category";
import { HTTP_METHODS, PURGED_REF, REQUEST_LABELS } from "./data";

export const MATRIX_RECORDS_SLUG = "matrix-records";
export const MATRIX_RECORDS_API = `${MATRIX_API}/records`;

const PAGE_SIZE = 50;
const PAGE_SIZES = [25, 50, 100, 200];
const UNDO_SECONDS = 10;
const LOWEST_STATUS = 100;
const HIGHEST_STATUS = 599;

const METHOD_TONES: Record<string, MatrixSelectOption["tone"]> = {
  GET: "info",
  POST: "success",
  PUT: "warning",
  PATCH: "warning",
  DELETE: "error",
};

const METHOD_OPTIONS: MatrixSelectOption[] = HTTP_METHODS.map((method) => ({
  value: method,
  label: method,
  tone: METHOD_TONES[method],
}));

const LABEL_OPTIONS: MatrixSelectOption[] = REQUEST_LABELS.map((label) => ({
  value: label,
  label,
}));

// Database style: the headers are the field names, the description their
// stored type, as a collection browser shows them.
const COLUMNS: MatrixColumn[] = [
  {
    id: "_id",
    label: "_id",
    description: "ObjectId",
    icon: "i-ph-key",
    editable: false,
    pinned: true,
    width: 230,
  },
  {
    id: "method",
    label: "method",
    description: "string",
    kind: "select",
    options: METHOD_OPTIONS,
    width: 110,
  },
  {
    id: "path",
    label: "path",
    description: "string",
    required: true,
    width: 300,
  },
  {
    id: "status",
    label: "status",
    description: "int32",
    kind: "number",
    integer: true,
    min: LOWEST_STATUS,
    max: HIGHEST_STATUS,
    align: "end",
    width: 90,
  },
  {
    id: "durationMs",
    label: "durationMs",
    description: "double, null: timed out",
    kind: "number",
    min: 0,
    nullable: true,
    align: "end",
    width: 130,
  },
  {
    id: "cached",
    label: "cached",
    description: "bool",
    kind: "boolean",
    width: 90,
  },
  {
    id: "receivedAt",
    label: "receivedAt",
    description: "date (and time)",
    kind: "datetime",
    width: 190,
  },
  {
    id: "client",
    label: "client",
    description: "string, nullable",
    nullable: true,
    width: 140,
  },
  {
    id: "headers",
    label: "headers",
    description: "object (string values)",
    kind: "json",
    width: 220,
  },
  {
    id: "body",
    label: "body",
    description: "object, array or null",
    kind: "json",
    nullable: true,
    width: 260,
  },
  {
    id: "sql",
    label: "sql",
    description: "string (SQL)",
    kind: "code",
    language: "sql",
    hidden: true,
    width: 260,
  },
  {
    id: "labels",
    label: "labels",
    description: "array of strings",
    kind: "tags",
    options: LABEL_OPTIONS,
    width: 170,
  },
  {
    id: "notes",
    label: "notes",
    description: "string, nullable",
    kind: "longText",
    nullable: true,
    width: 280,
  },
];

// The grouped grid keeps the scalar fields: the grouping is the point.
const GROUPED_COLUMNS = [
  "_id",
  "method",
  "path",
  "status",
  "durationMs",
  "receivedAt",
  "client",
];

@RegisterPage()
export class PageMatrixRecords extends PageController(
  MATRIX_RECORDS_SLUG,
  {
    displayName: "Records (database style)",
    icon: "i-ph-database",
    category: matrixCategory,
    order: 10,
    description:
      "A Matrix as a collection browser: 300 documents of mixed field types, paged, sorted, searched and filtered on the server, edited with a double click, staged, reviewed and saved together, with an undo.",
  },
  DefaultLayout({ fullWidth: true }),
) {
  static guide = demoGuide([
    {
      label: "Click a cell",
      text: 'A hovered cell is framed as its input; a click opens it, ready to type. Esc goes back to the cell, the arrows move, Enter edits again. Each kind takes its own input; typing "null" empties a nullable field (durationMs, client, body, notes).',
    },
    {
      label: "Open body, headers or a long note",
      text: 'editIn "auto": json and code cells, and texts holding a line break or over 120 characters, are edited in a drawer. sql is hidden: show it from the columns menu.',
    },
    {
      label: "Edit a few cells, then save",
      text: 'saveMode: "staged": each edited cell shows its old value struck through; the save bar\'s review (review: true) lists before → after; an Undo stays 10 s after the save (undoSeconds).',
    },
    {
      label: `Edit ${PURGED_REF}, then save`,
      text: `Search ${PURGED_REF} (4th row). The route answers a row error (the document was purged after the grid read it): the change stays in its row with the message, the others are written.`,
    },
    {
      label: "Set a status to 700, or a path without /",
      text: "The route checks each cell and answers per-cell errors; a body must be an object, an array or null.",
    },
    {
      label: "Open a whole row",
      text: "rowPanel: the ⤢ button of the row header, or Space, opens the document as a form, with a JSON tab (showJson). J / K step through the rows. The open row is in the page URL (deepLink): refresh, it opens again.",
    },
    {
      label: "Sort, search, filter",
      text: "sortable sends sort / direction, search searches ref, _id, path, client and notes, the facets send facet_method=GET,POST and facet_status=4xx,5xx (the status choices and their counts come from the response).",
    },
    {
      label: "Filter a column",
      text: "columnFilters: [method, path, status, client, cached, receivedAt]: a filter (contains, is) in those headers only, not on json or code fields; sent as filter_<column>=contains:<text> and shown as removable chips. Try path contains orders, client is pos-lg4, or receivedAt contains 2026-10-24.",
    },
    {
      label: "Edit a receivedAt",
      text: 'kind: "datetime": the date and the time of the request, edited with both.',
    },
    {
      label: "Page through 300 documents",
      text: 'pagination: "pages", pageSize 50, pageSizes 25 to 200; rowHeader.numbers numbers the rows across pages.',
    },
    {
      label: "Resize, hide, export",
      text: "resizableColumns, columnsMenu (show, hide, reorder; remembered on the device), exportCsv.",
    },
    {
      label: "Fold a method group (second grid)",
      text: 'grouping: { groupByField: "method", collapsible, count }: a header per method with its row count; the route sorts on the method first (?groupBy=method), the sort you pick applies inside each group.',
    },
  ]);

  static records = Matrix({
    title: "api_requests",
    description:
      "The shop's API log: 300 documents, newest first, kept in memory (a restart reseeds them).",
    fetchUrl: `${MATRIX_RECORDS_API}/rows`,
    saveUrl: `${MATRIX_RECORDS_API}/save`,
    columns: COLUMNS,
    rowHeader: { label: "ref", numbers: true, width: 130 },
    saveMode: "staged",
    review: true,
    undoSeconds: UNDO_SECONDS,
    rowPanel: { title: "Document", showJson: true, deepLink: true },
    pagination: "pages",
    pageSize: PAGE_SIZE,
    pageSizes: PAGE_SIZES,
    sortable: true,
    search: true,
    // The scalar fields: a json or code cell has no text to match.
    columnFilters: [
      "method",
      "path",
      "status",
      "client",
      "cached",
      "receivedAt",
    ],
    facets: [
      {
        id: "method",
        label: "Method",
        icon: "i-ph-arrows-left-right",
        multiple: true,
        items: METHOD_OPTIONS.map(({ value, label }) => ({ value, label })),
      },
      {
        id: "status",
        label: "Status",
        icon: "i-ph-traffic-signal",
        multiple: true,
      },
    ],
    resizableColumns: true,
    columnsMenu: true,
    exportCsv: true,
    emptyLabel: "No document matches the search and the filters.",
    density: "compact",
    maxHeight: "70vh",
  });

  static byMethod = Matrix({
    title: "api_requests, grouped by method",
    description:
      "The same documents grouped on a column (grouping.groupByField): the route lists them sorted on the method, each group folds and counts its rows.",
    fetchUrl: `${MATRIX_RECORDS_API}/rows?groupBy=method`,
    saveUrl: `${MATRIX_RECORDS_API}/save`,
    columns: COLUMNS.filter((column) => GROUPED_COLUMNS.includes(column.id)),
    rowHeader: { label: "ref", width: 130 },
    grouping: { groupByField: "method", collapsible: true, count: true },
    pagination: "pages",
    pageSize: PAGE_SIZE,
    sortable: true,
    search: true,
    saveMode: "staged",
    density: "compact",
    maxHeight: "60vh",
  });
}
