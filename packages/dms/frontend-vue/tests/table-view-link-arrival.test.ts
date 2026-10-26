/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { TablePreferences } from "../layers/dms-ui/app/build/composables/table-view/useTablePreferences";
import {
  isLinkedArrival,
  isLinkedVisit,
  linkedArrivalPreferences,
  linkFollowingPreferences,
  linkKeyScope,
  type LinkFollowingOptions,
  type TableLinkArrival,
  type TableLinkVisit,
  urlFilterScope,
} from "../layers/dms-ui/app/build/composables/table-view/utils/linkedArrival";
import {
  pageArrivalKind,
  trackPageArrivals,
} from "../layers/dms-ui/app/build/composables/table-view/utils/pageArrival";

const SOLE_TABLE = { tableId: "content", isSoleTableView: true };
const QUERY_PARAM_FILTERS = { customer: { field: "customerId" } };

const arrival = (
  query: Record<string, unknown>,
  rememberedTab = "all",
  keptLinkScope?: string,
  overrides: Partial<TableLinkArrival> = {},
) =>
  isLinkedArrival({
    query,
    urlScope: SOLE_TABLE,
    queryParamFilters: QUERY_PARAM_FILTERS,
    isVisit: false,
    rememberedTab,
    keptLinkScope,
    shownLink: undefined,
    ...overrides,
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

  it("is a link when the URL names no view, with an empty key", () => {
    expect(arrival({ view: "" })).toBe(true);
    expect(arrival({ "content.view": "" })).toBe(true);
  });

  it("takes the tab the user left open, written in the URL, for a reload", () => {
    expect(arrival({ tab: "overdue" }, "overdue")).toBe(false);
    expect(arrival({ tab: "overdue" }, "all")).toBe(true);
  });

  it("follows a link clicked to the kept tab, over the kept view", () => {
    expect(
      arrival({ tab: "overdue" }, "overdue", undefined, { isVisit: true }),
    ).toBe(true);
    expect(
      arrival({ "content.tab": "overdue" }, "overdue", undefined, {
        isVisit: true,
      }),
    ).toBe(true);
    expect(arrival({}, "overdue", undefined, { isVisit: true })).toBe(false);
  });

  it("shows again on reload the link the user has not made their own", () => {
    const shownLink = linkKeyScope(
      { "content.tab": "overdue" },
      SOLE_TABLE,
      QUERY_PARAM_FILTERS,
    );
    expect(
      arrival({ tab: "overdue" }, "overdue", undefined, { shownLink }),
    ).toBe(true);
    expect(
      arrival({ tab: "overdue", customer: "c1" }, "overdue", undefined, {
        shownLink,
      }),
    ).toBe(true);
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
        isVisit: true,
        rememberedTab: "all",
        keptLinkScope: undefined,
        shownLink: undefined,
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
      isLinkClick: false,
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

  it("follows an empty view key to no view, unless no view is open", () => {
    expect(visit({ query: { view: "" } })).toBe(true);
    expect(visit({ query: { view: "" }, activeView: undefined })).toBe(false);
    expect(
      visit({ query: { view: "" }, activeView: undefined, isLinkClick: true }),
    ).toBe(true);
  });

  it("leaves a view or a tab the table cannot open", () => {
    expect(visit({ query: { view: "gone" } })).toBe(false);
    expect(visit({ query: { tab: "billing" } })).toBe(false);
  });

  it("follows a link clicked on the page even to what the table shows", () => {
    expect(
      visit({ query: { "content.tab": "closed" }, isLinkClick: true }),
    ).toBe(true);
    expect(visit({ query: { view: "unassigned" }, isLinkClick: true })).toBe(
      true,
    );
    expect(
      visit({
        query: { customer: "c1" },
        previousQuery: { customer: "c1" },
        isLinkClick: true,
      }),
    ).toBe(true);
    expect(visit({ query: { tab: "billing" }, isLinkClick: true })).toBe(false);
    expect(visit({ query: { period: "month" }, isLinkClick: true })).toBe(
      false,
    );
  });

  it("opens a row named on the table as it stands, its page included", () => {
    expect(visit({ query: { record: "r2" } })).toBe(false);
    expect(visit({ query: { record: "r2" }, isLinkClick: true })).toBe(false);
    expect(
      visit({
        query: { record: "r2", "content.record": "r2" },
        previousQuery: { record: "r1" },
        isLinkClick: true,
      }),
    ).toBe(false);
  });

  it("follows a row's link only for what changes the listing", () => {
    const rowLink = (query: Record<string, unknown>) =>
      visit({
        query: { record: "r2", ...query },
        previousQuery: { customer: "c1" },
        isLinkClick: true,
      });

    expect(rowLink({ customer: "c1" })).toBe(false);
    expect(rowLink({ customer: "c1", view: "unassigned", tab: "closed" })).toBe(
      false,
    );

    expect(rowLink({ customer: "c2" })).toBe(true);
    expect(rowLink({ view: "outstanding" })).toBe(true);
    expect(rowLink({ tab: "open" })).toBe(true);
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
        linkKeys: () => "keys",
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
      ["shownLink", undefined],
    ]);
  });

  it("keeps none of a link's listing state until the user picks their own", async () => {
    const { preferences, written } = setUp(true);
    preferences.set("activeView", "paid", undefined);
    preferences.set("viewMode", "cards", "table");
    await preferences.settleArrival();
    preferences.set("pagination", { pageIndex: 1, pageSize: 10 }, undefined);
    expect(written).toEqual([
      ["viewMode", "cards"],
      ["shownLink", "keys"],
    ]);
    expect(window.location.search).toBe("?view=paid&tab=all");
  });

  it("keeps the whole state shown once the user picks a view, and drops the link's", async () => {
    const { preferences, written } = setUp(true);
    await preferences.settleArrival();
    preferences.set("activeView", "outstanding", undefined);
    expect(written).toEqual([
      ["shownLink", "keys"],
      ["activeView", "outstanding"],
      ["activeTab", "all"],
      ["columnFilters", []],
      ["linkScope", "scope"],
      ["shownLink", undefined],
    ]);
    expect(window.location.search).toBe("?tab=all");
    preferences.set("sorting", [], []);
    expect(written.slice(-3)).toEqual([
      ["sorting", []],
      ["linkScope", "scope"],
      ["shownLink", undefined],
    ]);
  });

  it("keeps no listing state of a link followed in place, until the user's choice", async () => {
    const { preferences, written } = setUp(false);
    await preferences.followLink(() => {
      preferences.set("activeTab", "all", "all");
      preferences.set("columnFilters", [], []);
      preferences.set("viewMode", "cards", "table");
    });
    expect(written).toEqual([
      ["viewMode", "cards"],
      ["shownLink", "keys"],
    ]);
    preferences.set("activeTab", "open", "all");
    expect(written.map(([field]) => field)).toEqual([
      "viewMode",
      "shownLink",
      "activeView",
      "activeTab",
      "columnFilters",
      "linkScope",
      "shownLink",
    ]);
  });
});

describe("a link to the kept tab, reloads and the user's pick", () => {
  const keptStore = (): TablePreferences & {
    kept: Record<string, unknown>;
  } => {
    const kept: Record<string, unknown> = {};
    return {
      kept,
      get: <V>(field: string, fallback: V) =>
        (field in kept ? kept[field] : fallback) as V,
      set: (field, value) => {
        if (value === undefined) Reflect.deleteProperty(kept, field);
        else kept[field] = value;
      },
      restore: () => undefined,
    };
  };

  const arriveOn = (
    store: TablePreferences,
    url: string,
    isVisit: boolean,
    shown: { view: string | undefined; tab: string },
  ) => {
    window.history.replaceState(null, "", url);
    const query = Object.fromEntries(new URL(url, "http://x").searchParams);
    const isLinked = isLinkedArrival({
      query,
      urlScope: SOLE_TABLE,
      queryParamFilters: QUERY_PARAM_FILTERS,
      isVisit,
      rememberedTab: store.get("activeTab", "all"),
      keptLinkScope: store.get<string | undefined>("linkScope", undefined),
      shownLink: store.get<string | undefined>("shownLink", undefined),
    });
    const read = isLinked ? linkedArrivalPreferences(store) : store;
    const preferences = linkFollowingPreferences(read, {
      isLinkedArrival: isLinked,
      urlScope: SOLE_TABLE,
      linkScope: () => urlFilterScope(query, QUERY_PARAM_FILTERS),
      linkKeys: () => linkKeyScope(query, SOLE_TABLE, QUERY_PARAM_FILTERS),
      listingState: () => [
        ["activeView", shown.view, undefined],
        ["activeTab", shown.tab, "all"],
      ],
    });
    return {
      isLinked,
      view: read.get<string | undefined>("activeView", undefined),
      preferences,
    };
  };

  const userState = () => {
    const store = keptStore();
    store.set("activeView", "due-week", undefined);
    store.set("activeTab", "overdue", "all");
    return store;
  };

  it("opens a link clicked to the kept tab on the defaults plus that tab", async () => {
    const store = userState();
    const reload = arriveOn(store, "/invoices?tab=overdue", false, {
      view: "due-week",
      tab: "overdue",
    });
    expect(reload.isLinked).toBe(false);
    expect(reload.view).toBe("due-week");

    const link = arriveOn(store, "/invoices?content.tab=overdue", true, {
      view: undefined,
      tab: "overdue",
    });
    expect(link.isLinked).toBe(true);
    expect(link.view).toBeUndefined();
    await link.preferences.settleArrival();
    expect(store.kept.activeView).toBe("due-week");
  });

  it("restores the kept state on a full reload of the URL the table wrote", () => {
    const store = userState();
    const reload = arriveOn(store, "/invoices?tab=overdue", false, {
      view: "due-week",
      tab: "overdue",
    });
    expect(reload.isLinked).toBe(false);
    expect(reload.view).toBe("due-week");
  });

  it("shows the link again on reload until the user picks their own state", async () => {
    const store = userState();
    const link = arriveOn(store, "/invoices?content.tab=overdue", true, {
      view: undefined,
      tab: "overdue",
    });
    await link.preferences.settleArrival();

    const reload = arriveOn(store, "/invoices?content.tab=overdue", false, {
      view: undefined,
      tab: "overdue",
    });
    expect(reload.isLinked).toBe(true);
    expect(reload.view).toBeUndefined();
  });

  it("restores the user's pick on reload after a link", async () => {
    const store = userState();
    const link = arriveOn(store, "/invoices?content.tab=overdue", true, {
      view: "paid",
      tab: "overdue",
    });
    await link.preferences.settleArrival();
    link.preferences.set("activeView", "paid", undefined);
    expect(store.kept).toMatchObject({
      activeView: "paid",
      activeTab: "overdue",
    });
    expect(store.kept.shownLink).toBeUndefined();

    const reload = arriveOn(store, "/invoices?content.tab=overdue", false, {
      view: "paid",
      tab: "overdue",
    });
    expect(reload.isLinked).toBe(false);
    expect(reload.view).toBe("paid");
  });
});

describe("pageArrivalKind", () => {
  const announce = (prefetch: boolean) =>
    document.dispatchEvent(
      new CustomEvent("inertia:before", { detail: { visit: { prefetch } } }),
    );

  it("tells a full load, a visit and Back apart", () => {
    expect(pageArrivalKind()).toBe("load");
    trackPageArrivals();
    trackPageArrivals();
    announce(true);
    expect(pageArrivalKind()).toBe("load");
    announce(false);
    expect(pageArrivalKind()).toBe("visit");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(pageArrivalKind()).toBe("history");
    announce(false);
    expect(pageArrivalKind()).toBe("visit");
  });
});
