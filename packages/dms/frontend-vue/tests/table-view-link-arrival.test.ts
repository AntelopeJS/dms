import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { TablePreferences } from "../layers/dms-ui/app/build/composables/table-view/useTablePreferences";
import {
  isLinkedArrival,
  isLinkedVisit,
  linkedArrivalPreferences,
  linkFollowingPreferences,
  type TableLinkVisit,
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

describe("isLinkedVisit", () => {
  const visit = (overrides: Partial<TableLinkVisit>) =>
    isLinkedVisit({
      query: {},
      previousQuery: {},
      urlScope: SOLE_TABLE,
      queryParamFilters: QUERY_PARAM_FILTERS,
      activeView: "unassigned",
      activeTab: "closed",
      canOpenView: (id) => id !== "gone",
      canOpenTab: (id) => id !== "billing",
      ...overrides,
    });

  it("follows a URL filter the last visit did not carry", () => {
    expect(visit({ query: { customer: "c1" } })).toBe(true);
    expect(
      visit({ query: { customer: "c2" }, previousQuery: { customer: "c1" } }),
    ).toBe(true);
  });

  it("leaves a visit repeating the URL filter it was reached with", () => {
    expect(
      visit({
        query: { customer: "c1", period: "month" },
        previousQuery: { customer: "c1" },
      }),
    ).toBe(false);
    expect(visit({ query: { period: "month" } })).toBe(false);
  });

  it("follows a view or a tab other than the one shown", () => {
    expect(visit({ query: { view: "outstanding" } })).toBe(true);
    expect(visit({ query: { tab: "open" } })).toBe(true);
    expect(visit({ query: { view: "unassigned", tab: "closed" } })).toBe(false);
  });

  it("leaves a view or a tab the table cannot open", () => {
    expect(visit({ query: { view: "gone" } })).toBe(false);
    expect(visit({ query: { tab: "billing" } })).toBe(false);
  });

  it("follows a row the last visit did not name", () => {
    expect(visit({ query: { record: "r2" } })).toBe(true);
    expect(
      visit({ query: { record: "r2" }, previousQuery: { record: "r2" } }),
    ).toBe(false);
  });
});

describe("linkFollowingPreferences", () => {
  it("keeps no listing state while a link is followed, then keeps it again", async () => {
    const written: string[] = [];
    const preferences = linkFollowingPreferences({
      get: <V>(_field: string, fallback: V) => fallback,
      set: (field) => {
        written.push(field);
      },
      restore: () => undefined,
    });
    await preferences.followLink(() => {
      preferences.set("activeTab", "all", "all");
      preferences.set("columnFilters", [], []);
      preferences.set("viewMode", "cards", "table");
    });
    preferences.set("sorting", [], []);
    expect(written).toEqual(["viewMode", "sorting"]);
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
      /const tablePreferences = linkFollowingPreferences\(\s*isLinked \? linkedArrivalPreferences\(keptPreferences\) : keptPreferences,\s*\);/,
    );
    expect(tableView).not.toMatch(/keptPreferences\.(set|restore)\(/);
  });

  it("follows a link to the page already shown without keeping its state", () => {
    expect(tableView).toMatch(/useTableLinkedVisit\(\{/);
    expect(tableView).toMatch(
      /tablePreferences\.followLink\(\(\) => \{\s*openLinkedView\(query\);/,
    );
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
