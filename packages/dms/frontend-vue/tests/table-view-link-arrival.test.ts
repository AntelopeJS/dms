import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { TablePreferences } from "../layers/dms-ui/app/build/composables/table-view/useTablePreferences";
import {
  isLinkedArrival,
  linkedArrivalPreferences,
} from "../layers/dms-ui/app/build/composables/table-view/utils/linkedArrival";

const SOLE_TABLE = { tableId: "content", isSoleTableView: true };
const QUERY_PARAM_FILTERS = { customer: { field: "customerId" } };

const arrival = (query: Record<string, unknown>, rememberedTab = "all") =>
  isLinkedArrival({
    query,
    urlScope: SOLE_TABLE,
    queryParamFilters: QUERY_PARAM_FILTERS,
    rememberedTab,
  });

describe("isLinkedArrival", () => {
  it("is a plain visit without any key the table reads", () => {
    expect(arrival({})).toBe(false);
    expect(arrival({ period: "month" })).toBe(false);
  });

  it("is a link when the URL names a view, a record or a URL filter", () => {
    expect(arrival({ view: "outstanding" })).toBe(true);
    expect(arrival({ "content.view": "outstanding" })).toBe(true);
    expect(arrival({ record: "r1" })).toBe(true);
    expect(arrival({ customer: "c1" })).toBe(true);
  });

  it("takes the tab the user left open, written in the URL, for a reload", () => {
    expect(arrival({ tab: "overdue" }, "overdue")).toBe(false);
    expect(arrival({ tab: "overdue" }, "all")).toBe(true);
  });

  it("ignores a short key a page with several tables does not give it", () => {
    expect(
      isLinkedArrival({
        query: { view: "outstanding" },
        urlScope: { tableId: "content" },
        queryParamFilters: undefined,
        rememberedTab: "all",
      }),
    ).toBe(false);
  });
});

describe("linkedArrivalPreferences", () => {
  const kept: Record<string, unknown> = {
    activeView: "unassigned",
    activeTab: "closed",
    columnFilters: [{ accessorKey: "status", mode: "is", value: "x" }],
    sorting: [{ id: "title", desc: true }],
    pagination: { pageIndex: 4, pageSize: 10 },
    columnVisibility: { email: false },
    viewMode: "cards",
  };
  const written: Array<[string, unknown]> = [];
  const preferences: TablePreferences = {
    get: <V>(field: string, fallback: V) =>
      (field in kept ? kept[field] : fallback) as V,
    set: (field, value) => {
      written.push([field, value]);
    },
    restore: () => undefined,
  };
  const linked = linkedArrivalPreferences(preferences);

  it("reads the listing state as its defaults", () => {
    expect(linked.get("activeView", undefined)).toBe(undefined);
    expect(linked.get("activeTab", "all")).toBe("all");
    expect(linked.get("columnFilters", [])).toEqual([]);
    expect(linked.get("sorting", [])).toEqual([]);
    expect(linked.get("pagination", { pageIndex: 0, pageSize: 10 })).toEqual({
      pageIndex: 0,
      pageSize: 10,
    });
  });

  it("keeps the reader's presentation choices", () => {
    expect(linked.get("columnVisibility", {})).toEqual({ email: false });
    expect(linked.get("viewMode", "table")).toBe("cards");
  });

  it("still keeps what the user changes", () => {
    linked.set("sorting", [{ id: "dueAt", desc: false }], []);
    expect(written).toEqual([["sorting", [{ id: "dueAt", desc: false }]]]);
  });
});

describe("table view wiring", () => {
  const tableView = readFileSync(
    resolve(
      __dirname,
      "../layers/dms-ui/app/components/table-view/TableView.vue",
    ),
    "utf8",
  );

  it("reads its state through the link-arrival preferences", () => {
    expect(tableView).toMatch(
      /const tablePreferences = isLinked\s*\?\s*linkedArrivalPreferences\(keptPreferences\)\s*:\s*keptPreferences;/,
    );
    expect(tableView).not.toMatch(/keptPreferences\.(set|restore)\(/);
  });

  it("publishes a tab's navigation badge without the page's URL filters", () => {
    expect(tableView).toMatch(
      /query: countQuery\(tab\.filters, undefined, \[\]\),/,
    );
    expect(tableView).toMatch(
      /const count = navBadgeCount\(source, tab\.count\);/,
    );
  });
});
