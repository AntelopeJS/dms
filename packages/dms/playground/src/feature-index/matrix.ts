import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

const AREA = FEATURE_AREAS.matrix;
const ROOT = "/matrix";

// The release the Matrix block ships in: the next minor after 0.11.0.
const MATRIX_RELEASE = "0.12.0";

const PAGES = {
  overview: `${ROOT}/matrix-options`,
  records: `${ROOT}/matrix-records`,
  translations: `${ROOT}/matrix-translations`,
  stock: `${ROOT}/matrix-stock`,
  allocation: `${ROOT}/matrix-allocation`,
  roster: `${ROOT}/matrix-roster`,
};

function feature(name: string, api: string, demo: string): PlaygroundFeature {
  return { area: AREA, feature: name, api, demo, since: MATRIX_RELEASE };
}

/** The Matrix block's features, page by page. */
export const MATRIX_FEATURES: PlaygroundFeature[] = [
  feature(
    "A read-only grid from static data, totals both ways",
    "Matrix({ staticData, totals: { rows, columns } })",
    PAGES.overview,
  ),
  feature(
    "Records of mixed types edited in place",
    'Matrix({ fetchUrl, saveUrl, columns: [{ kind: "json" | "keyValue" | "code" | … }] })',
    PAGES.records,
  ),
  feature(
    "Double click to edit, a click selects",
    'editTrigger: "doubleClick"',
    PAGES.records,
  ),
  feature(
    "Objects, code and long texts edited in a drawer",
    'columns[].editIn: "auto"',
    PAGES.records,
  ),
  feature(
    "Staged edits, reviewed, saved together, undo",
    'saveMode: "staged", review: true, undoSeconds',
    PAGES.records,
  ),
  feature(
    "Per-cell and per-row errors of the save route",
    "MatrixSaveResponse.errors [{ rowId, columnId?, message }]",
    PAGES.records,
  ),
  feature(
    "A row in a drawer, with a JSON tab, kept in the URL",
    "rowPanel: { showJson: true, deepLink: true }",
    PAGES.records,
  ),
  feature(
    "A filter in the chosen column headers, as chips",
    'columnFilters: ["method", "path", …] (filter_<column>=<mode>:<value>)',
    PAGES.records,
  ),
  feature(
    "Date and time cells",
    'columns[]: { kind: "datetime" }',
    PAGES.records,
  ),
  feature(
    "Server paging with row numbers",
    'pagination: "pages", pageSize, pageSizes, rowHeader: { numbers: true }',
    PAGES.records,
  ),
  feature(
    "Server sort, search and facets",
    "sortable, search, facets (facet_<id>=a,b)",
    PAGES.records,
  ),
  feature(
    "Rows grouped on a column",
    "grouping: { groupByField, collapsible, count }",
    PAGES.records,
  ),
  feature(
    "Columns shown, hidden, reordered, resized; CSV export",
    "columnsMenu, resizableColumns, exportCsv",
    PAGES.records,
  ),
  feature(
    "Columns answered by the route, with a badge and a meter",
    "MatrixData.columns [{ badge, progress }]",
    PAGES.translations,
  ),
  feature(
    "Click to edit, saved cell by cell, Enter moves down",
    'editTrigger: "click", saveMode: "immediate", enterMove: "down"',
    PAGES.translations,
  ),
  feature(
    "Conflicts detected, Overwrite or Discard",
    'conflicts: "detect" (MatrixSaveResponse.conflicts, force)',
    PAGES.translations,
  ),
  feature(
    "Base text as placeholder, issues on a cell",
    "MatrixRow.cells[id].placeholder / issues",
    PAGES.translations,
  ),
  feature(
    "A cell edited in the drawer whatever its column says",
    'MatrixRow.cells[id].editIn: "panel"',
    PAGES.translations,
  ),
  feature(
    "A menu of actions per row, a badge on the row",
    "rowActions [{ id, label, target, visibleWhen }], MatrixRow.badge",
    PAGES.translations,
  ),
  feature(
    "A save answering the view it moved",
    "MatrixSaveRequest.query → MatrixSaveResponse { counts, columns, groups, footer }",
    PAGES.translations,
  ),
  feature(
    "Status segments with counts",
    "statusFilters, MatrixData.counts",
    PAGES.translations,
  ),
  feature(
    "Server groups, collapsible and counted",
    "MatrixRow.group, MatrixData.groups, grouping: { collapseAbove, count }",
    PAGES.translations,
  ),
  feature(
    "Infinite scrolling, jump to empty, edited rows kept",
    'pagination: "infinite", jumpToEmpty, keepEditedRows',
    PAGES.translations,
  ),
  feature(
    "Stock by size and store, cross highlight",
    "totals, crossHighlight, legend",
    PAGES.stock,
  ),
  feature(
    "Hatched cells out of range, alert tones, annex columns",
    "cells[id].disabled / tone, columns[].excludeFromTotals / display",
    PAGES.stock,
  ),
  feature(
    "Group subtotals",
    "grouping: { groupByField, subtotals: true }",
    PAGES.stock,
  ),
  feature(
    "A cell opening a prefilled form",
    'cellAction: { type: "drawer", component: Form({ fetchUrl: "…?store={{row.id}}&size={{row.column}}" }) }',
    PAGES.stock,
  ),
  feature(
    "Targets that hold the save until totals match",
    "targets: { columns, total, blockSave, message }",
    PAGES.allocation,
  ),
  feature(
    "Fills computed by the server",
    "fillActions [{ id, label, url }] → { changes }",
    PAGES.allocation,
  ),
  feature(
    "Rows checked, a fill on the checked rows",
    "selectable: true, fill actions receive { rows, selected }",
    PAGES.allocation,
  ),
  feature(
    "Type to edit, the stock as a hint",
    "typeToEdit, cells[id].hint",
    PAGES.allocation,
  ),
  feature(
    "Before / after, the old value struck through",
    "cells[id].previous",
    PAGES.allocation,
  ),
  feature(
    "Toned labels picked from a select",
    'columns[]: { kind: "select", options: [{ value, label, tone }] }',
    PAGES.roster,
  ),
  feature(
    "Row descriptions and tones from the route",
    "MatrixRow.description / tone",
    PAGES.roster,
  ),
];
