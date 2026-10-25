/**
 * The Matrix block's pure logic: the query a grid reads with and keeps in the
 * URL, the merge and arrangement of its columns, its totals and targets, the
 * cells edited in a drawer, the editor values it refuses, its groups, its
 * keyboard moves, and its CSV.
 */
import { describe, expect, it } from "vitest";
import {
  applyStaticQuery,
  buildMatrixQuery,
  clampPage,
  emptyMatrixQuery,
  nextMatrixSort,
  pagerItems,
} from "../layers/dms-ui/app/build/composables/matrix/matrixQuery";
import {
  matrixUrlEntries,
  readMatrixUrlState,
} from "../layers/dms-ui/app/build/composables/matrix/matrixUrlState";
import {
  matrixColumnWidth,
  mergeMatrixColumns,
  moveColumnOrder,
  visibleMatrixColumns,
} from "../layers/dms-ui/app/build/composables/matrix/matrixColumns";
import {
  computeMatrixTotals,
  matrixTargetMisses,
  mergeMatrixTargets,
} from "../layers/dms-ui/app/build/composables/matrix/matrixTotals";
import {
  editorModelOf,
  editsInPanel,
  isSameValue,
  parseTextDraft,
  structuredSizeTag,
  valueFromEditorModel,
} from "../layers/dms-ui/app/build/composables/matrix/matrixValues";
import {
  buildMatrixSections,
  initiallyCollapsed,
  isFoldable,
  shownRows,
} from "../layers/dms-ui/app/build/composables/matrix/matrixSections";
import {
  enterMoveTarget,
  findMatrixCell,
  moveMatrixFocus,
} from "../layers/dms-ui/app/build/composables/matrix/matrixNavigation";
import {
  csvCell,
  matrixCsv,
  matrixCsvFileName,
} from "../layers/dms-ui/app/build/composables/matrix/matrixCsv";
import type {
  MatrixColumn,
  MatrixRow,
} from "../layers/dms-ui/app/types/matrix";

describe("query", () => {
  const state = {
    ...emptyMatrixQuery(50),
    page: 2,
    search: " alma ",
    status: "missing",
    facets: { store: ["ENT", "WEB"], empty: [] },
    sort: { columnId: "size", direction: "desc" as const },
  };

  it("sends the filters, the sort and the page", () => {
    expect(buildMatrixQuery(state, "pages")).toEqual({
      search: "alma",
      status: "missing",
      facet_store: "ENT,WEB",
      sort: "size",
      direction: "desc",
      offset: "100",
      limit: "50",
    });
  });

  it("sends no paging without pagination, the offset asked for an infinite grid", () => {
    expect(buildMatrixQuery(state, "none")).not.toHaveProperty("offset");
    expect(buildMatrixQuery(state, "infinite", 150)).toMatchObject({
      offset: "150",
      limit: "50",
    });
  });

  it("cycles a header's sort ascending, descending, none", () => {
    const asc = nextMatrixSort(null, "a");
    expect(asc).toEqual({ columnId: "a", direction: "asc" });
    const desc = nextMatrixSort(asc, "a");
    expect(desc).toEqual({ columnId: "a", direction: "desc" });
    expect(nextMatrixSort(desc, "a")).toBeNull();
    expect(nextMatrixSort(desc, "b")).toEqual({
      columnId: "b",
      direction: "asc",
    });
  });

  it("numbers the pager with gaps", () => {
    const items = pagerItems(5, 20).map((item) =>
      item.type === "gap" ? "…" : item.page + 1,
    );
    expect(items).toEqual([1, "…", 4, 5, 6, 7, 8, "…", 20]);
    expect(pagerItems(0, 1)).toEqual([{ type: "page", page: 0 }]);
  });

  it("brings a page past the end back to the last one", () => {
    expect(clampPage(9, 120, 50)).toBe(2);
    expect(clampPage(1, 120, 50)).toBe(1);
  });

  it("searches, sorts and pages static rows in the browser", () => {
    const rows: MatrixRow[] = [
      { id: "a", label: "Alma", values: { size: 38 } },
      { id: "b", label: "Bella", values: { size: 36 } },
      { id: "c", label: "Alba", values: { size: 40 } },
    ];
    const found = applyStaticQuery(
      { rows },
      {
        ...emptyMatrixQuery(1),
        search: "al",
        sort: { columnId: "size", direction: "desc" },
      },
      "pages",
    );
    expect(found.total).toBe(2);
    expect(found.rows.map((row) => row.id)).toEqual(["c"]);
  });
});

describe("URL state", () => {
  const defaults = emptyMatrixQuery(50);

  it("keeps each grid's state under its own prefix, defaults left out", () => {
    const entries = matrixUrlEntries(
      "stock",
      {
        ...defaults,
        page: 1,
        search: "alma",
        facets: { store: ["ENT"] },
        sort: { columnId: "38", direction: "asc" },
      },
      defaults,
      ["store", "size"],
    );
    expect(entries).toEqual({
      "stock.page": "2",
      "stock.size": undefined,
      "stock.search": "alma",
      "stock.status": undefined,
      "stock.sort": "38",
      "stock.dir": "asc",
      "stock.facet_store": "ENT",
      "stock.facet_size": undefined,
    });
  });

  it("reads its own keys back, and only its own", () => {
    const state = readMatrixUrlState(
      {
        "stock.page": "3",
        "stock.search": "alma",
        "stock.facet_store": "ENT,WEB",
        "stock.sort": "38",
        "stock.dir": "desc",
        "other.page": "9",
        page: "7",
      },
      "stock",
      defaults,
      ["store"],
    );
    expect(state).toEqual({
      page: 2,
      pageSize: 50,
      search: "alma",
      status: "",
      facets: { store: ["ENT", "WEB"] },
      sort: { columnId: "38", direction: "desc" },
    });
  });

  it("ignores a page or a direction that means nothing", () => {
    const state = readMatrixUrlState(
      { "g.page": "-2", "g.sort": "a", "g.dir": "sideways" },
      "g",
      defaults,
      [],
    );
    expect(state.page).toBe(0);
    expect(state.sort).toBeNull();
  });
});

describe("columns", () => {
  const block: MatrixColumn[] = [
    { id: "key", label: "Key", width: 240 },
    { id: "en", label: "English" },
    { id: "notes", label: "Notes", kind: "longText" },
  ];
  const answered: MatrixColumn[] = [
    { id: "fr", label: "French", badge: "12 missing" },
    { id: "en", label: "English (base)", badge: "Base" },
  ];

  it("draws the response's columns in its order, then the block's others; the response wins", () => {
    const merged = mergeMatrixColumns(block, answered);
    expect(merged.map((column) => column.id)).toEqual([
      "fr",
      "en",
      "key",
      "notes",
    ]);
    expect(merged[1]).toEqual({
      id: "en",
      label: "English (base)",
      badge: "Base",
    });
  });

  it("keeps the block's columns alone, or the response's alone", () => {
    expect(mergeMatrixColumns(block, undefined)).toEqual(block);
    expect(mergeMatrixColumns(undefined, answered)).toEqual(answered);
  });

  it("orders, hides and pins as the user and the columns say", () => {
    const columns: MatrixColumn[] = [
      { id: "a", label: "A" },
      { id: "b", label: "B", hidden: true },
      { id: "c", label: "C", pinned: true },
      { id: "d", label: "D" },
    ];
    expect(
      visibleMatrixColumns(columns, {
        order: ["d", "a"],
        hidden: { b: false, a: true },
      }).map((column) => column.id),
    ).toEqual(["c", "d", "b"]);
    expect(moveColumnOrder(columns, "d", -1)).toEqual(["a", "b", "d", "c"]);
    expect(moveColumnOrder(columns, "a", -1)).toEqual(["a", "b", "c", "d"]);
  });

  it("clamps a width between 80 and 640 pixels", () => {
    expect(
      matrixColumnWidth({ id: "a", label: "A" }, { widths: { a: 20 } }),
    ).toBe(80);
    expect(matrixColumnWidth({ id: "a", label: "A", width: 900 }, {})).toBe(
      640,
    );
    expect(matrixColumnWidth({ id: "a", label: "A", kind: "number" }, {})).toBe(
      104,
    );
  });
});

describe("totals and targets", () => {
  const columns: MatrixColumn[] = [
    { id: "36", label: "36", kind: "number" },
    { id: "37", label: "37", kind: "number" },
    { id: "price", label: "Price", kind: "number", excludeFromTotals: true },
    { id: "status", label: "Status" },
  ];
  const rows: MatrixRow[] = [
    { id: "ENT", values: { 36: 4, 37: 6, price: 90, status: "ok" } },
    { id: "WEB", values: { 36: 2, 37: null, price: 90 } },
  ];
  const valueOf = (row: MatrixRow, columnId: string) => row.values[columnId];

  it("adds rows, columns and the grand total, excluded columns left out of the rows", () => {
    expect(computeMatrixTotals(rows, columns, valueOf)).toEqual({
      rows: { ENT: 10, WEB: 2 },
      columns: { 36: 6, 37: 6, price: 180 },
      total: 12,
    });
  });

  it("counts the edits on screen", () => {
    const edited = (row: MatrixRow, columnId: string) =>
      row.id === "WEB" && columnId === "37" ? 8 : row.values[columnId];
    expect(computeMatrixTotals(rows, columns, edited).total).toBe(20);
  });

  it("says which totals miss their target", () => {
    const totals = computeMatrixTotals(rows, columns, valueOf);
    const misses = matrixTargetMisses(
      { columns: { 36: 6, 37: 8 }, rows: { ENT: 10 }, total: 14 },
      totals,
    );
    expect([...misses.columns]).toEqual(["37"]);
    expect(misses.rows.size).toBe(0);
    expect(misses.total).toBe(true);
    expect(misses.isMissed).toBe(true);
    expect(matrixTargetMisses(undefined, totals).isMissed).toBe(false);
  });

  it("tolerates the drift of decimal sums", () => {
    const decimal: MatrixColumn[] = [{ id: "a", label: "A", kind: "number" }];
    const totals = computeMatrixTotals(
      [
        { id: "x", values: { a: 0.1 } },
        { id: "y", values: { a: 0.2 } },
      ],
      decimal,
      valueOf,
    );
    expect(matrixTargetMisses({ total: 0.3 }, totals).isMissed).toBe(false);
  });

  it("lays the route's targets over the block's", () => {
    expect(
      mergeMatrixTargets(
        { columns: { 36: 4 }, blockSave: true },
        { columns: { 37: 2 }, total: 6 },
      ),
    ).toEqual({
      columns: { 36: 4, 37: 2 },
      rows: {},
      total: 6,
      blockSave: true,
    });
  });
});

describe("values", () => {
  it("edits json, code and long texts in a drawer, the rest in place", () => {
    const json: MatrixColumn = { id: "j", label: "J", kind: "json" };
    const text: MatrixColumn = { id: "t", label: "T" };
    expect(editsInPanel(json, { a: 1 })).toBe(true);
    expect(editsInPanel({ ...json, editIn: "cell" }, { a: 1 })).toBe(false);
    expect(editsInPanel(text, "short")).toBe(false);
    expect(editsInPanel(text, "two\nlines")).toBe(true);
    expect(editsInPanel(text, "x".repeat(121))).toBe(true);
    expect(editsInPanel({ ...text, editIn: "panel" }, "short")).toBe(true);
    expect(editsInPanel({ id: "n", label: "N", kind: "number" }, 12)).toBe(
      false,
    );
  });

  it("reads null in a nullable text, and \\null as the word", () => {
    expect(parseTextDraft("null", true)).toBeNull();
    expect(parseTextDraft("null", false)).toBe("null");
    expect(parseTextDraft("\\null", true)).toBe("null");
  });

  it("refuses what the column does not take, before sending", () => {
    const quantity: MatrixColumn = {
      id: "q",
      label: "Q",
      kind: "number",
      integer: true,
      min: 0,
      max: 10,
      required: true,
    };
    expect(valueFromEditorModel(quantity, 2.5)).toMatchObject({
      reason: "integer",
    });
    expect(valueFromEditorModel(quantity, -1)).toMatchObject({ reason: "min" });
    expect(valueFromEditorModel(quantity, 11)).toMatchObject({ reason: "max" });
    expect(valueFromEditorModel(quantity, null)).toMatchObject({
      reason: "required",
    });
    expect(valueFromEditorModel(quantity, 4)).toEqual({ ok: true, value: 4 });
    const json: MatrixColumn = { id: "j", label: "J", kind: "json" };
    expect(valueFromEditorModel(json, "{oops")).toMatchObject({
      ok: false,
      reason: "json",
    });
    expect(valueFromEditorModel(json, '{"a":[1]}')).toEqual({
      ok: true,
      value: { a: [1] },
    });
  });

  it("opens each kind's editor on the value it understands", () => {
    expect(editorModelOf({ id: "j", label: "J", kind: "json" }, { a: 1 })).toBe(
      '{\n  "a": 1\n}',
    );
    expect(editorModelOf({ id: "t", label: "T", kind: "tags" }, null)).toEqual(
      [],
    );
    expect(editorModelOf({ id: "n", label: "N", kind: "number" }, "12")).toBe(
      12,
    );
    expect(editorModelOf({ id: "t", label: "T" }, null)).toBe("");
  });

  it("compares values: objects by content, every empty alike", () => {
    expect(isSameValue({ a: [1] }, { a: [1] })).toBe(true);
    expect(isSameValue(null, "")).toBe(true);
    expect(isSameValue([], undefined)).toBe(true);
    expect(isSameValue(0, null)).toBe(false);
    expect(isSameValue("1", 1)).toBe(false);
  });

  it("sizes an object or a list in a tag", () => {
    expect(structuredSizeTag({ a: 1, b: 2, c: 3 })).toBe("{3}");
    expect(structuredSizeTag([1, 2])).toBe("[2]");
  });
});

describe("groups", () => {
  const rows: MatrixRow[] = [
    { id: "free", values: { method: null } },
    { id: "a", values: { method: "GET" } },
    { id: "b", group: "server", values: { method: "GET" } },
    { id: "c", values: { method: "POST" } },
    { id: "d", values: { method: "GET" } },
  ];
  const groupOf = (row: MatrixRow) =>
    row.values.method
      ? { key: String(row.values.method), label: String(row.values.method) }
      : null;

  it("files a row under its group, else under its value, the rest first without a header", () => {
    const sections = buildMatrixSections(
      rows,
      [{ id: "server", label: "Server group", collapsed: true }],
      groupOf,
    );
    expect(
      sections.map((section) => [
        section.group?.label ?? null,
        section.rows.map((row) => row.id),
      ]),
    ).toEqual([
      [null, ["free"]],
      ["Server group", ["b"]],
      ["GET", ["a", "d"]],
      ["POST", ["c"]],
    ]);
  });

  it("starts the groups folded as answered, or all past collapseAbove", () => {
    const sections = buildMatrixSections(
      rows,
      [{ id: "server", label: "S", collapsed: true }],
      groupOf,
    );
    expect(initiallyCollapsed(sections, undefined, 5)).toEqual(["server"]);
    expect(initiallyCollapsed(sections, { collapseAbove: 4 }, 5)).toHaveLength(
      3,
    );
    expect(
      shownRows(sections, initiallyCollapsed(sections, undefined, 5)).map(
        (row) => row.id,
      ),
    ).toEqual(["free", "a", "d", "c"]);
  });

  it("folds on a header click when collapsible, or when a group may start folded", () => {
    const plain = buildMatrixSections(rows, undefined, groupOf);
    expect(isFoldable({ collapsible: true }, plain)).toBe(true);
    expect(isFoldable(undefined, plain)).toBe(false);
    expect(isFoldable({ collapseAbove: 10 }, plain)).toBe(true);
    expect(isFoldable({ collapsible: false, collapseAbove: 1 }, plain)).toBe(
      false,
    );
  });
});

describe("keyboard", () => {
  const shape = { rowIds: ["r1", "r2", "r3"], columnIds: ["a", "b", "c"] };
  const at = (rowId: string, columnId: string) => ({ rowId, columnId });

  it("moves by one cell, to the edges with Ctrl, and stays inside the grid", () => {
    expect(moveMatrixFocus(shape, at("r1", "a"), "ArrowDown")).toEqual(
      at("r2", "a"),
    );
    expect(moveMatrixFocus(shape, at("r1", "a"), "ArrowUp")).toEqual(
      at("r1", "a"),
    );
    expect(moveMatrixFocus(shape, at("r2", "b"), "ArrowRight", true)).toEqual(
      at("r2", "c"),
    );
    expect(moveMatrixFocus(shape, at("r2", "b"), "End", true)).toEqual(
      at("r3", "c"),
    );
    expect(moveMatrixFocus(shape, at("r2", "b"), "Home")).toEqual(
      at("r2", "a"),
    );
    expect(moveMatrixFocus(shape, at("r1", "a"), "PageDown")).toEqual(
      at("r3", "a"),
    );
    expect(moveMatrixFocus(shape, null, "ArrowDown")).toEqual(at("r1", "a"));
    expect(moveMatrixFocus(shape, at("r1", "a"), "x")).toBeNull();
  });

  it("finds the next editable cell row by row, not past the last", () => {
    const editable = (address: { columnId: string }) =>
      address.columnId !== "b";
    expect(findMatrixCell(shape, at("r1", "a"), 1, editable)).toEqual(
      at("r1", "c"),
    );
    expect(findMatrixCell(shape, at("r1", "c"), 1, editable)).toEqual(
      at("r2", "a"),
    );
    expect(findMatrixCell(shape, at("r2", "a"), -1, editable)).toEqual(
      at("r1", "c"),
    );
    expect(findMatrixCell(shape, at("r3", "c"), 1, editable)).toBeNull();
  });

  it("goes round to find the next empty cell", () => {
    const empty = (address: { rowId: string; columnId: string }) =>
      address.rowId === "r1" && address.columnId === "b";
    expect(findMatrixCell(shape, at("r3", "a"), 1, empty, true)).toEqual(
      at("r1", "b"),
    );
    expect(findMatrixCell(shape, null, 1, empty, true)).toEqual(at("r1", "b"));
    expect(findMatrixCell(shape, at("r1", "b"), 1, empty, true)).toBeNull();
  });

  it("moves down, right or nowhere after Enter", () => {
    expect(enterMoveTarget(shape, at("r1", "a"), "down")).toEqual(
      at("r2", "a"),
    );
    expect(enterMoveTarget(shape, at("r1", "a"), "right")).toEqual(
      at("r1", "b"),
    );
    expect(enterMoveTarget(shape, at("r1", "a"), "stay")).toEqual(
      at("r1", "a"),
    );
  });
});

describe("CSV", () => {
  it("quotes cells, doubles quotes and keeps formulas as text", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("=SUM(A1:A9)")).toBe('"\'=SUM(A1:A9)"');
    expect(csvCell("-2+3")).toBe('"\'-2+3"');
    expect(csvCell(-12)).toBe('"-12"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("starts with a byte order mark and ends its CRLF lines", () => {
    const csv = matrixCsv(["Store", "36"], [["ENT", 4]]);
    expect(csv).toBe('﻿"Store","36"\r\n"ENT","4"\r\n');
  });

  it("names the file after the title and the day", () => {
    expect(
      matrixCsvFileName(
        "Stock — Tamaris Alma",
        new Date("2026-10-25T10:00:00Z"),
      ),
    ).toBe("stock-tamaris-alma-2026-10-25.csv");
    expect(matrixCsvFileName("", new Date("2026-10-25T10:00:00Z"))).toBe(
      "matrix-2026-10-25.csv",
    );
  });
});
