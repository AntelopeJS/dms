/**
 * The counters of a table's tabs and views count what a click on them would
 * list, the rest of the table's state kept: a tab under the open view's
 * filters, the search and the page's URL filters; a view under the open tab.
 * The menu badge of a `navBadge` tab stays the page's global count.
 */
import { describe, expect, it } from "vitest";
import type { TableFilter } from "../layers/dms-ui/app/entries/components/table/Table";
import {
  buildTableCountQueries,
  isCountNarrowed,
  NAV_BADGE_COUNT_ID_PREFIX,
  navBadgeCount,
  type TableCountQueriesInput,
  VIEW_COUNT_ID_PREFIX,
} from "../layers/dms-ui/app/entries/composables/table-view/utils/tableCounts";
import { buildTableQuery } from "../layers/dms-ui/app/entries/composables/table-view/utils/tableQuery";

const outstanding: TableFilter = {
  accessorKey: "dueState",
  mode: "is",
  value: "outstanding",
};
const sentTab: TableFilter = {
  accessorKey: "status",
  mode: "is",
  value: "sent",
};
const paidTab: TableFilter = {
  accessorKey: "status",
  mode: "is",
  value: "paid",
};
const customerUrl: TableFilter = {
  accessorKey: "customer",
  mode: "is",
  value: "c-1",
};
const highAmount: TableFilter = {
  accessorKey: "amount",
  mode: "gte",
  value: "1000",
};

const TABS = [
  { id: "all", filters: [], hasNavBadge: false },
  { id: "sent", filters: [sentTab], hasNavBadge: false },
  { id: "paid", filters: [paidTab], hasNavBadge: true },
];
const VIEWS = [
  { id: "outstanding", filters: [outstanding] },
  { id: "large", filters: [highAmount], search: "acme" },
];

const input = (
  state: Partial<TableCountQueriesInput> = {},
): TableCountQueriesInput => ({
  scopeFilters: [],
  tabFilters: [],
  columnFilters: [],
  tabs: TABS,
  views: VIEWS,
  ...state,
});

/** What the table lists under these filters, as a count asks for it. */
const listed = (
  columnFilters: TableFilter[],
  hiddenFilters: TableFilter[],
  search?: string,
) =>
  buildTableQuery({
    pagination: { pageIndex: 0, pageSize: 0 },
    sorting: [],
    columnFilters,
    hiddenFilters,
    globalFilter: search,
  });

const queryOf = (
  queries: ReturnType<typeof buildTableCountQueries>,
  id: string,
) => queries.find((entry) => entry.id === id)?.query;

describe("contextual table counters", () => {
  it("counts each tab under the open view's filters", () => {
    const queries = buildTableCountQueries(
      input({ columnFilters: [outstanding], activeViewId: "outstanding" }),
    );
    expect(queryOf(queries, "all")).toEqual(listed([outstanding], []));
    expect(queryOf(queries, "sent")).toEqual(listed([outstanding], [sentTab]));
    expect(queryOf(queries, "sent")).toMatchObject({
      filter_dueState: "is:outstanding",
      filter_status: "is:sent",
    });
  });

  it("asks for a tab the very query the table lists once that tab is open", () => {
    const queries = buildTableCountQueries(
      input({
        scopeFilters: [customerUrl],
        tabFilters: [sentTab],
        columnFilters: [outstanding],
        search: "acme",
      }),
    );
    expect(queryOf(queries, "paid")).toEqual(
      listed([outstanding], [customerUrl, paidTab], "acme"),
    );
  });

  it("counts the tabs under the search and the filters the user picks", () => {
    const queries = buildTableCountQueries(
      input({ columnFilters: [highAmount], search: "acme" }),
    );
    expect(queryOf(queries, "sent")).toMatchObject({
      filter_amount: "gte:1000",
      filter_status: "is:sent",
      search: "acme",
    });
  });

  it("applies the page's URL filters to every counter", () => {
    const queries = buildTableCountQueries(
      input({ scopeFilters: [customerUrl], activeViewId: "outstanding" }),
    );
    for (const id of ["all", "sent", `${VIEW_COUNT_ID_PREFIX}large`]) {
      expect(queryOf(queries, id)).toMatchObject({ filter_customer: "is:c-1" });
    }
  });

  it("counts another view with its own filters and search, under the open tab", () => {
    const queries = buildTableCountQueries(
      input({
        tabFilters: [sentTab],
        columnFilters: [outstanding, { ...highAmount, value: "50" }],
        search: "draft",
        activeViewId: "outstanding",
      }),
    );
    expect(queryOf(queries, `${VIEW_COUNT_ID_PREFIX}large`)).toEqual(
      listed([highAmount], [sentTab], "acme"),
    );
  });

  it("counts the open view as the rows listed, as the user edited it", () => {
    const columnFilters = [outstanding, highAmount];
    const queries = buildTableCountQueries(
      input({
        tabFilters: [sentTab],
        columnFilters,
        search: "acme",
        activeViewId: "outstanding",
      }),
    );
    expect(queryOf(queries, `${VIEW_COUNT_ID_PREFIX}outstanding`)).toEqual(
      listed(columnFilters, [sentTab], "acme"),
    );
  });

  it("asks one counter per tab and per counted view", () => {
    const queries = buildTableCountQueries(input());
    expect(queries.map(({ id }) => id)).toEqual([
      "all",
      "sent",
      "paid",
      `${VIEW_COUNT_ID_PREFIX}outstanding`,
      `${VIEW_COUNT_ID_PREFIX}large`,
    ]);
  });
});

describe("navigation badge of a tab", () => {
  const navId = `${NAV_BADGE_COUNT_ID_PREFIX}paid`;

  it("needs no count of its own while nothing narrows the tab's counter", () => {
    const queries = buildTableCountQueries(input());
    expect(queryOf(queries, navId)).toBeUndefined();
    expect(navBadgeCount({ paid: 149 }, "paid", false)).toBe(149);
  });

  it.each([
    ["a view or a filter", { columnFilters: [outstanding] }],
    ["the search", { search: "acme" }],
    ["a URL filter", { scopeFilters: [customerUrl] }],
  ])("is counted on the tab alone under %s", (_, state) => {
    const narrowed = input(state);
    expect(isCountNarrowed(narrowed)).toBe(true);
    const queries = buildTableCountQueries(narrowed);
    expect(queryOf(queries, navId)).toEqual(listed([], [paidTab]));
    expect(navBadgeCount({ paid: 3, [navId]: 149 }, "paid", true)).toBe(149);
  });

  it("waits for the global count rather than publish a narrowed one", () => {
    expect(navBadgeCount({ paid: 3 }, "paid", true)).toBeUndefined();
    expect(navBadgeCount(null, "paid", false)).toBeUndefined();
  });

  it("ignores filters without a value", () => {
    expect(
      isCountNarrowed(
        input({
          columnFilters: [{ accessorKey: "status", mode: "is", value: "" }],
        }),
      ),
    ).toBe(false);
  });
});
