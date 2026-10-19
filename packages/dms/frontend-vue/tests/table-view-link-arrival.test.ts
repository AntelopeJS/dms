// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { TablePreferences } from "../layers/dms-ui/app/build/composables/table-view/useTablePreferences";
import {
  isLinkedArrival,
  isLinkedVisit,
  linkedArrivalPreferences,
  linkFollowingPreferences,
  type LinkFollowingOptions,
  type TableLinkVisit,
  urlFilterScope,
} from "../layers/dms-ui/app/build/composables/table-view/utils/linkedArrival";

const SOLE_TABLE = { tableId: "content", isSoleTableView: true };
const QUERY_PARAM_FILTERS = { customer: { field: "customerId" } };

const arrival = (
  query: Record<string, unknown>,
  rememberedTab = "all",
  keptLinkScope?: string,
) =>
  isLinkedArrival({
    query,
    urlScope: SOLE_TABLE,
    queryParamFilters: QUERY_PARAM_FILTERS,
    rememberedTab,
    keptLinkScope,
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

  it("takes the URL filters the kept state was chosen under for a reload", () => {
    const scope = urlFilterScope({ customer: "c1" }, QUERY_PARAM_FILTERS);
    expect(arrival({ customer: "c1", tab: "open" }, "open", scope)).toBe(false);
    expect(arrival({ customer: "c2" }, "all", scope)).toBe(true);
    expect(arrival({ customer: "c1", view: "outstanding" }, "all", scope)).toBe(
      true,
    );
  });

  it("ignores a short key a page with several tables does not give it", () => {
    expect(
      isLinkedArrival({
        query: { view: "outstanding" },
        urlScope: { tableId: "content" },
        queryParamFilters: undefined,
        rememberedTab: "all",
        keptLinkScope: undefined,
      }),
    ).toBe(false);
  });
});

describe("urlFilterScope", () => {
  const filters = { customer: { field: "customerId" }, ticket: { field: "n" } };

  it("is undefined without a URL filter", () => {
    expect(urlFilterScope({ period: "month" }, filters)).toBeUndefined();
    expect(urlFilterScope({ customer: "c1" }, undefined)).toBeUndefined();
  });

  it("stands for the URL filters' values, whatever else the URL carries", () => {
    expect(
      urlFilterScope({ ticket: "T1", customer: "c1", tab: "open" }, filters),
    ).toBe(urlFilterScope({ customer: "c1", ticket: "T1" }, filters));
    expect(urlFilterScope({ customer: "c1" }, filters)).not.toBe(
      urlFilterScope({ customer: "c2" }, filters),
    );
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
  const LISTING_STATE: LinkFollowingOptions["listingState"] = () => [
    ["activeView", "outstanding", undefined],
    ["activeTab", "all", "all"],
    ["columnFilters", [], []],
  ];

  const setUp = (isLinked: boolean) => {
    window.history.replaceState(null, "", "/invoices?view=paid&tab=all");
    const written: Array<[string, unknown]> = [];
    const preferences = linkFollowingPreferences(
      {
        get: <V>(_field: string, fallback: V) => fallback,
        set: (field, value) => {
          written.push([field, value]);
        },
        restore: () => undefined,
      },
      {
        isLinkedArrival: isLinked,
        urlScope: SOLE_TABLE,
        linkScope: () => "scope",
        listingState: LISTING_STATE,
      },
    );
    return { preferences, written };
  };

  it("keeps the listing state of a plain visit, with its URL filters", () => {
    const { preferences, written } = setUp(false);
    preferences.set("sorting", [], []);
    expect(written).toEqual([
      ["sorting", []],
      ["linkScope", "scope"],
    ]);
  });

  it("keeps none of a link's listing state until the user picks their own", async () => {
    const { preferences, written } = setUp(true);
    preferences.set("activeView", "paid", undefined);
    preferences.set("viewMode", "cards", "table");
    await preferences.settleArrival();
    preferences.set("pagination", { pageIndex: 1, pageSize: 10 }, undefined);
    expect(written).toEqual([["viewMode", "cards"]]);
    expect(window.location.search).toBe("?view=paid&tab=all");
  });

  it("keeps the whole state shown once the user picks a view, and drops the link's", async () => {
    const { preferences, written } = setUp(true);
    await preferences.settleArrival();
    preferences.set("activeView", "outstanding", undefined);
    expect(written).toEqual([
      ["activeView", "outstanding"],
      ["activeTab", "all"],
      ["columnFilters", []],
      ["linkScope", "scope"],
    ]);
    expect(window.location.search).toBe("?tab=all");
    preferences.set("sorting", [], []);
    expect(written.slice(-2)).toEqual([
      ["sorting", []],
      ["linkScope", "scope"],
    ]);
  });

  it("keeps no listing state of a link followed in place, until the user's choice", async () => {
    const { preferences, written } = setUp(false);
    await preferences.followLink(() => {
      preferences.set("activeTab", "all", "all");
      preferences.set("columnFilters", [], []);
      preferences.set("viewMode", "cards", "table");
    });
    expect(written).toEqual([["viewMode", "cards"]]);
    preferences.set("activeTab", "open", "all");
    expect(written.map(([field]) => field)).toEqual([
      "viewMode",
      "activeView",
      "activeTab",
      "columnFilters",
      "linkScope",
    ]);
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
      /const tablePreferences = linkFollowingPreferences\(\s*isLinked \? linkedArrivalPreferences\(keptPreferences\) : keptPreferences,\s*\{\s*isLinkedArrival: isLinked,/,
    );
    expect(tableView).not.toMatch(/keptPreferences\.(set|restore)\(/);
    expect(tableView).toMatch(
      /onMounted\(\(\) => void tablePreferences\.settleArrival\(\)\);/,
    );
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
