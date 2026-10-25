/**
 * The Matrix block's logic added or fixed after review: objects in a text
 * column edited as JSON, the escape of a "null" text, numbers typed as
 * text, date-times, column filters (query, URL, static rows), the Total
 * column placed before the columns left out of the totals, groups that
 * cannot fold never start folded, kept rows never pinned across pages,
 * save answers kept over the pages read, and select options handed to a
 * cell display.
 */
import { describe, expect, it } from "vitest";
import {
  datetimeInputOf,
  editingColumnOf,
  editorModelOf,
  editsInPanel,
  parseTextDraft,
  shownValueText,
  valueFromEditorModel,
} from "../layers/dms-ui/app/build/composables/matrix/matrixValues";
import {
  applyStaticQuery,
  buildMatrixQuery,
  emptyMatrixQuery,
  parseColumnFilter,
} from "../layers/dms-ui/app/build/composables/matrix/matrixQuery";
import {
  matrixUrlEntries,
  readMatrixUrlRow,
  readMatrixUrlState,
} from "../layers/dms-ui/app/build/composables/matrix/matrixUrlState";
import { matrixGridSlots } from "../layers/dms-ui/app/build/composables/matrix/matrixLayout";
import {
  computeMatrixTotals,
  totalColumnIndex,
} from "../layers/dms-ui/app/build/composables/matrix/matrixTotals";
import {
  buildMatrixSections,
  initiallyCollapsed,
} from "../layers/dms-ui/app/build/composables/matrix/matrixSections";
import { keptRowIds } from "../layers/dms-ui/app/build/composables/matrix/useMatrixRows";
import {
  answerOverridesOf,
  mergePages,
  withAnswerOverrides,
} from "../layers/dms-ui/app/build/composables/matrix/useMatrixData";
import { matrixRenderColumn } from "../layers/dms-ui/app/build/composables/matrix/matrixRender";
import type {
  MatrixColumn,
  MatrixRow,
} from "../layers/dms-ui/app/types/matrix";

describe("values", () => {
  const text: MatrixColumn = { id: "t", label: "T" };

  it("edits an object found in a text column as JSON, in the drawer (7)", () => {
    expect(editingColumnOf(text, { a: 1 })).toEqual({ ...text, kind: "json" });
    expect(editingColumnOf(text, "plain")).toBe(text);
    expect(editsInPanel({ ...text, editIn: "cell" }, [1, 2])).toBe(true);
    const editing = editingColumnOf(text, { a: 1 });
    expect(valueFromEditorModel(editing, '{"a":2}')).toEqual({
      ok: true,
      value: { a: 2 },
    });
  });

  it("keeps the text null in a nullable cell, escaped (10)", () => {
    const nullable: MatrixColumn = { ...text, nullable: true };
    expect(editorModelOf(nullable, "null")).toBe("\\null");
    expect(editorModelOf(nullable, "\\null")).toBe("\\\\null");
    expect(valueFromEditorModel(nullable, "\\null")).toEqual({
      ok: true,
      value: "null",
    });
    expect(valueFromEditorModel(nullable, "\\\\null")).toEqual({
      ok: true,
      value: "\\null",
    });
    expect(parseTextDraft("null", true)).toBeNull();
    // Opened on the text "null" and left as it was, nothing changes.
    expect(
      valueFromEditorModel(nullable, editorModelOf(nullable, "null")),
    ).toEqual({ ok: true, value: "null" });
    expect(editorModelOf(text, "null")).toBe("null");
  });

  it("reads a number typed as text, sign and decimal comma kept (16)", () => {
    const number: MatrixColumn = { id: "n", label: "N", kind: "number" };
    expect(valueFromEditorModel(number, "-4")).toEqual({ ok: true, value: -4 });
    expect(valueFromEditorModel(number, "1,5")).toEqual({
      ok: true,
      value: 1.5,
    });
    expect(valueFromEditorModel(number, "-")).toMatchObject({
      ok: false,
      reason: "number",
    });
  });

  it("edits a date and time in local time, written as ISO", () => {
    const datetime: MatrixColumn = { id: "d", label: "D", kind: "datetime" };
    const local = datetimeInputOf("2026-10-25T09:30:00.000Z");
    expect(local).toMatch(/^2026-10-25T\d{2}:30$/);
    const read = valueFromEditorModel(datetime, local);
    expect(read).toEqual({ ok: true, value: "2026-10-25T09:30:00.000Z" });
    expect(valueFromEditorModel(datetime, "")).toEqual({
      ok: true,
      value: null,
    });
    expect(valueFromEditorModel(datetime, "never")).toMatchObject({
      reason: "datetime",
    });
  });

  it("shows no value as an em dash, never a word", () => {
    expect(shownValueText(null)).toBe("—");
    expect(shownValueText("")).toBe("—");
    expect(shownValueText(0)).toBe("0");
  });
});

describe("column filters", () => {
  const state = {
    ...emptyMatrixQuery(25),
    filters: { method: { mode: "is" as const, value: "GET" } },
  };

  it("sends filter_<column>=<mode>:<value>, in the save query too", () => {
    expect(buildMatrixQuery(state, "none")).toEqual({
      filter_method: "is:GET",
    });
    expect(parseColumnFilter("contains:a:b")).toEqual({
      mode: "contains",
      value: "a:b",
    });
    expect(parseColumnFilter("near:x")).toBeNull();
  });

  it("keeps them in the URL, and removes the ones cleared", () => {
    const defaults = emptyMatrixQuery(25);
    expect(
      matrixUrlEntries("rec", state, defaults, [], {
        path: { mode: "contains", value: "/api" },
      }),
    ).toMatchObject({
      "rec.filter_method": "is:GET",
      "rec.filter_path": undefined,
    });
    expect(
      readMatrixUrlState(
        { "rec.filter_path": "contains:/api", "other.filter_x": "is:1" },
        "rec",
        defaults,
        [],
      ).filters,
    ).toEqual({ path: { mode: "contains", value: "/api" } });
    expect(readMatrixUrlRow({ "rec.row": "r42" }, "rec")).toBe("r42");
  });

  it("filters static rows in the browser", () => {
    const rows: MatrixRow[] = [
      { id: "a", values: { method: "GET", path: "/api/a" } },
      { id: "b", values: { method: "POST", path: "/api/b" } },
      { id: "c", values: { method: "GET", path: "/web" } },
    ];
    const filtered = applyStaticQuery(
      { rows },
      {
        ...state,
        filters: {
          method: { mode: "is", value: "get" },
          path: { mode: "contains", value: "API" },
        },
      },
      "none",
    );
    expect(filtered.rows.map((row) => row.id)).toEqual(["a"]);
  });
});

describe("totals", () => {
  const columns: MatrixColumn[] = [
    { id: "36", label: "36", kind: "number" },
    { id: "37", label: "37", kind: "number" },
    { id: "min", label: "Min", kind: "number", excludeFromTotals: true },
    { id: "status", label: "Status" },
  ];

  it("draws the Total column after the last column added up, annexes after it", () => {
    expect(totalColumnIndex(columns)).toBe(2);
    const slots = matrixGridSlots(columns, () => 80, 200, true);
    expect(slots.map((slot) => slot.key)).toEqual([
      "36",
      "37",
      "\u0000total",
      "min",
      "status",
    ]);
    expect(slots.map((slot) => slot.colIndex)).toEqual([2, 3, 4, 5, 6]);
    expect(matrixGridSlots(columns, () => 80, 200, false)).toHaveLength(4);
  });

  it("sticks the pinned columns after the row header, one after another", () => {
    const pinned: MatrixColumn[] = [
      { id: "a", label: "A", pinned: true },
      { id: "b", label: "B", pinned: true },
      { id: "c", label: "C" },
    ];
    const slots = matrixGridSlots(pinned, () => 100, 200, false);
    expect(
      slots.map((slot) => (slot.type === "column" ? slot.stickyStart : null)),
    ).toEqual([200, 300, undefined]);
  });

  it("leaves an excluded column out of the Total row (B5)", () => {
    const totals = computeMatrixTotals(
      [{ id: "r", values: { 36: 1, 37: 2, min: 50 } }],
      columns,
      (row, id) => row.values[id],
    );
    expect(totals.columns).toEqual({ 36: 1, 37: 2 });
  });
});

describe("groups, kept rows, answers", () => {
  it("never folds a group that cannot be opened (13)", () => {
    const sections = buildMatrixSections(
      [{ id: "r", group: "g", values: {} }],
      [{ id: "g", label: "G", collapsed: true }],
    );
    expect(initiallyCollapsed(sections, { collapsible: false }, 1)).toEqual([]);
    expect(
      initiallyCollapsed(sections, { collapsible: false, collapseAbove: 0 }, 9),
    ).toEqual([]);
    expect(initiallyCollapsed(sections, undefined, 1)).toEqual(["g"]);
  });

  it("keeps an edited row on the page it was edited on only (11)", () => {
    const row: MatrixRow = { id: "r9", values: {} };
    const kept = new Map([["r9", { row, pageKey: "0" }]]);
    expect(keptRowIds(kept, new Set(), "0")).toEqual(["r9"]);
    expect(keptRowIds(kept, new Set(), "1")).toEqual([]);
    expect(keptRowIds(kept, new Set(["r9"]), "0")).toEqual([]);
  });

  it("keeps a save's counts and columns over every page read (12)", () => {
    const pages = [
      { rows: [{ id: "a", values: {} }], counts: { missing: 4 } },
      { rows: [{ id: "b", values: {} }], counts: { missing: 4 } },
    ];
    const overrides = answerOverridesOf(
      {},
      {
        counts: { missing: 3 },
        columns: [{ id: "fr", label: "French", badge: "3 missing" }],
        footer: "3 missing",
      },
    );
    const shown = withAnswerOverrides(
      mergePages(pages) ?? { rows: [] },
      overrides,
    );
    expect(shown.rows.map((row) => row.id)).toEqual(["a", "b"]);
    expect(shown.counts).toEqual({ missing: 3 });
    expect(shown.columns?.[0]?.badge).toBe("3 missing");
    expect(shown.footer).toBe("3 missing");
    expect(
      answerOverridesOf(overrides, { counts: { done: 1 } }).counts,
    ).toEqual({ missing: 3, done: 1 });
  });
});

describe("cell display", () => {
  it("hands a display the select's options as its type's items (9)", () => {
    const column = matrixRenderColumn(
      {
        id: "status",
        label: "Status",
        kind: "select",
        options: [{ value: "out", label: "$stock.out", icon: "i-ph-x" }],
        display: { type: "status_pill" },
      },
      (text) => String(text).replace("$stock.out", "Rupture"),
    );
    expect(column.display).toEqual({ type: "status_pill" });
    expect(column.type?.id).toBe("select");
    expect(column.type?.inputComponent?.options).toEqual({
      items: [{ value: "out", label: "Rupture", icon: "i-ph-x" }],
    });
  });
});
