/**
 * A value that holds a record reads as its JSON wherever DMS writes a value
 * as text: a filter chip, a query, a quick filter, a relation badge,
 * a cascader path, a link, a bulk request, a group heading and a relation's
 * comparison. Each test fails on the `String(value)` that wrote
 * `[object Object]`.
 */
import { describe, expect, it } from "vitest";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import {
  readFieldPath,
  textOf,
} from "../layers/dms-core/app/entries/utils/dataTypeValue";
import { interpolateRowText } from "../layers/dms-core/app/utils/url-interpolation";
import { buildRelationBadges } from "../layers/dms-ui/app/entries/composables/data-types/relationBadges";
import { sameRelationValue } from "../layers/dms-ui/app/entries/composables/data-types/relationValue";
import { bulkSelectionQuery } from "../layers/dms-ui/app/entries/composables/actions/bulkSelection";
import { formatFilterValue } from "../layers/dms-ui/app/entries/composables/table/utils/formatFilterValue";
import { rowGroupKey } from "../layers/dms-ui/app/entries/composables/table-view/utils/groupedRows";
import {
  quickFilterValue,
  relationQuickFilterItems,
} from "../layers/dms-ui/app/entries/composables/table-view/utils/quickFilters";
import { buildTableQuery } from "../layers/dms-ui/app/entries/composables/table-view/utils/tableQuery";
import { buildCascaderPathLabels } from "../layers/dms-ui/app/utils/cascader";

const LOCALIZED = { en: "Admin", fr: "Administrateur" };
const LOCALIZED_TEXT = JSON.stringify(LOCALIZED);

describe("textOf", () => {
  it("writes a row, or a list holding one, as its JSON", () => {
    expect(textOf(LOCALIZED)).toBe(LOCALIZED_TEXT);
    expect(textOf([LOCALIZED])).toBe(`[${LOCALIZED_TEXT}]`);
  });

  it("writes anything else the way String does", () => {
    const date = new Date("2026-11-16T10:00:00Z");
    for (const value of [
      "text",
      0,
      false,
      null,
      undefined,
      date,
      ["a", 1, null],
    ]) {
      expect(textOf(value)).toBe(String(value));
    }
  });
});

describe("readFieldPath", () => {
  it("reads the paths @nuxt/ui's get reads", () => {
    const row = { customer: { name: "Ada" }, lines: [{ total: 3 }], 1: "one" };
    for (const path of ["customer.name", "lines.0.total", "1", "missing.x"]) {
      expect(readFieldPath(row, path)).toEqual(get(row, path));
    }
  });

  it("reads no member of a text or a list beyond its items", () => {
    expect(readFieldPath({ tags: ["a"], name: "Ada" }, "tags.length")).toBe(
      undefined,
    );
    expect(readFieldPath({ name: "Ada" }, "name.length")).toBe(undefined);
  });
});

describe("a value holding a record", () => {
  it("names a filter chip with its JSON", () => {
    const filter = { accessorKey: "role", mode: "is", value: LOCALIZED };
    expect(formatFilterValue(filter, [], () => undefined, "en")).toBe(
      LOCALIZED_TEXT,
    );
  });

  it("filters the list query by its JSON", () => {
    const query = buildTableQuery({
      pagination: { pageIndex: 0, pageSize: 10 },
      sorting: [],
      columnFilters: [{ accessorKey: "role", mode: "is", value: LOCALIZED }],
    });
    expect(query.filter_role).toBe(`is:${LOCALIZED_TEXT}`);
  });

  it("labels a quick filter and its pick with its JSON", () => {
    const source = { searchUrl: "/api/roles/select" };
    expect(
      relationQuickFilterItems([{ value: "r1", label: LOCALIZED }], source),
    ).toEqual([{ value: "r1", label: LOCALIZED_TEXT }]);
    expect(
      quickFilterValue(
        [{ accessorKey: "role", mode: "is", value: LOCALIZED }],
        {
          field: "role",
          mode: "is",
        },
      ),
    ).toBe(LOCALIZED_TEXT);
  });

  it("labels a relation badge with its JSON", () => {
    expect(buildRelationBadges([{ name: LOCALIZED }], "name").visible).toEqual([
      LOCALIZED_TEXT,
    ]);
  });

  it("names a cascader path step with its JSON", () => {
    const keyMapping = { label: "name", value: "_id", parent: "parent" };
    expect(
      buildCascaderPathLabels(
        [{ _id: "c1", name: LOCALIZED }],
        keyMapping,
        "c1",
      ),
    ).toEqual([LOCALIZED_TEXT]);
  });

  it("fills a link with the JSON of a related row's id", () => {
    const owner = { _id: { $oid: "u1" } };
    expect(interpolateRowText("{{row.owner}}", { owner })).toBe(
      JSON.stringify(owner._id),
    );
  });

  it("sends a bulk request's filter as its JSON", () => {
    const period = { start: "2026-10-01", end: "2026-10-31" };
    expect(bulkSelectionQuery({ matching: { period }, count: 2 })).toEqual({
      allMatching: "true",
      period: JSON.stringify(period),
    });
  });

  it("groups rows whose ids are records apart", () => {
    expect(rowGroupKey({ _id: { $oid: "a" } }, "value", "en")).not.toBe(
      rowGroupKey({ _id: { $oid: "b" } }, "value", "en"),
    );
  });

  it("compares a multiple relation of record ids as a set", () => {
    const first = { _id: { $oid: "a" } };
    const second = { _id: { $oid: "b" } };
    expect(
      sameRelationValue([first, second], [second, first], { multiple: true }),
    ).toBe(true);
  });
});
