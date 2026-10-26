/**
 * `pinnedRows`: the rows a rule accepts lead the list whatever the sort — the
 * base language of a languages table stays on top whichever column the user
 * sorts on, and on the first page.
 */
import { describe, expect, it, vi } from "vitest";
import {
  processSourceRows,
  useTableRows,
} from "../layers/dms-ui/app/entries/composables/table-view/useTableRows";
import {
  pinRows,
  pinRowsBySpan,
} from "../layers/dms-ui/app/entries/composables/table-view/utils/pinnedRows";
import { rowLocator } from "../layers/dms-ui/app/entries/composables/table-view/utils/locateRow";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types";

interface LanguageRow extends Record<string, unknown> {
  _id: string;
  name: string;
  coverage: number;
  isBase: boolean;
}

const LANGUAGES: LanguageRow[] = [
  { _id: "de", name: "Deutsch", coverage: 40, isBase: false },
  { _id: "en", name: "English", coverage: 100, isBase: true },
  { _id: "fr", name: "Français", coverage: 90, isBase: false },
  { _id: "es", name: "Español", coverage: 10, isBase: false },
];

const COLUMNS = [
  { id: "name", accessorKey: "name" },
  { id: "coverage", accessorKey: "coverage" },
] satisfies TableViewColumn[];

const BASE = { field: "isBase", equals: true };

type Api = Parameters<typeof useTableRows>[0]["api"];

const ids = (rows: LanguageRow[]) => rows.map((row) => row._id);

describe("pinRows", () => {
  it("puts the rows the rule accepts first, each part in its order", () => {
    expect(
      ids(pinRows(LANGUAGES, { field: "coverage", in: [10, 100] })),
    ).toEqual(["en", "es", "de", "fr"]);
  });

  it("leaves the rows as they are without a rule, or when none matches", () => {
    expect(pinRows(LANGUAGES, undefined)).toBe(LANGUAGES);
    expect(pinRows(LANGUAGES, { field: "_id", equals: "it" })).toBe(LANGUAGES);
  });
});

describe("a source sorted in the browser", () => {
  it("keeps the pinned row first in either direction", () => {
    const ascending = processSourceRows(
      LANGUAGES,
      { sortKey: "coverage", sortDirection: "asc" },
      {},
      COLUMNS,
      BASE,
    );
    const descending = processSourceRows(
      LANGUAGES,
      { sortKey: "name", sortDirection: "desc" },
      {},
      COLUMNS,
      BASE,
    );
    expect(ids(ascending.results)).toEqual(["en", "es", "de", "fr"]);
    expect(ids(descending.results)).toEqual(["en", "fr", "es", "de"]);
  });

  it("pins before the page is cut: the pinned row opens the first page", () => {
    const query = { sortKey: "coverage", sortDirection: "asc", limit: 2 };
    const first = processSourceRows(LANGUAGES, query, {}, COLUMNS, BASE);
    const second = processSourceRows(
      LANGUAGES,
      { ...query, offset: 2 },
      {},
      COLUMNS,
      BASE,
    );
    expect(ids(first.results)).toEqual(["en", "es"]);
    expect(ids(second.results)).toEqual(["de", "fr"]);
    expect(first.total).toBe(4);
  });
});

describe("rows a route sorts", () => {
  it("pins within the list a source route sorted itself", async () => {
    const sortedByRoute = [...LANGUAGES].sort(
      (a, b) => a.coverage - b.coverage,
    );
    const api = vi.fn(async () => ({ results: sortedByRoute, total: 4 }));
    const rows = useTableRows<LanguageRow>({
      // SAFETY: list requests only this fixture's row page; the generic API also describes unrelated endpoints.
      api: api as Api,
      location: "/api/languages",
      source: { fetchUrl: "/api/languages", capabilities: { sort: true } },
      columns: COLUMNS,
      pinnedRows: () => BASE,
    });
    const page = await rows.list({ sortKey: "coverage", sortDirection: "asc" });
    expect(ids(page!.results)).toEqual(["en", "es", "de", "fr"]);
  });

  it("pins within the page a controller answers, read on each request", async () => {
    const api = vi.fn(async () => ({
      results: LANGUAGES,
      total: 40,
      offset: 0,
      limit: 4,
    }));
    let pinned: typeof BASE | undefined = BASE;
    const rows = useTableRows<LanguageRow>({
      // SAFETY: list requests only this fixture's row page, not arbitrary generic API responses.
      api: api as Api,
      location: "/api/languages",
      columns: COLUMNS,
      pinnedRows: () => pinned,
    });
    expect(ids((await rows.list({}))!.results)).toEqual([
      "en",
      "de",
      "fr",
      "es",
    ]);
    pinned = undefined;
    expect(ids((await rows.list({}))!.results)).toEqual(ids(LANGUAGES));
  });
});

describe("the rows a paging table shows, pinned page by page", () => {
  const PAGE_SIZE = 4;
  const VIP = { field: "isVip", equals: true };

  const ANSWERED = Array.from({ length: 10 }, (_, index) => ({
    _id: `a${index}`,
    isVip: [1, 3, 6, 7].includes(index),
  }));

  const SHOWN = ["a1", "a3", "a0", "a2", "a6", "a7", "a4", "a5", "a8", "a9"];
  const idsOf = (rows: { _id: string }[]) => rows.map((row) => row._id);

  function controllerRows() {
    const api = vi.fn(
      async (_url: string, { query }: { query: Record<string, number> }) => ({
        results: ANSWERED.slice(query.offset, query.offset + query.limit),
        total: ANSWERED.length,
        offset: query.offset,
        limit: query.limit,
      }),
    );
    const rows = useTableRows({
      // SAFETY: list requests this fixture's numeric paging query and receives its row page.
      api: api as Api,
      location: "/api/customers",
      columns: COLUMNS,
      pinnedRows: () => VIP,
    });
    return { api, rows };
  }

  it("pins each span on its own", () => {
    expect(idsOf(pinRowsBySpan(ANSWERED, PAGE_SIZE, VIP))).toEqual(SHOWN);
    expect(pinRowsBySpan(ANSWERED, PAGE_SIZE, undefined)).toBe(ANSWERED);
  });

  it("reads any rows in the order the pages show them", async () => {
    const { api, rows } = controllerRows();
    const window = await rows.listAsShown({ offset: 3, limit: 4 }, PAGE_SIZE);
    expect(idsOf(window!.results)).toEqual(SHOWN.slice(3, 7));
    expect(window!.total).toBe(10);

    expect(api).toHaveBeenCalledWith("/api/customers/list", {
      query: { offset: 0, limit: 8 },
      signal: undefined,
    });
  });

  it("places a row and its neighbours as the table shows them, from a click or a link", async () => {
    const { rows } = controllerRows();
    const locate = rowLocator({
      list: async (offset, limit) =>
        rows.listAsShown({ offset, limit }, PAGE_SIZE),
      rowIdKey: "_id",
    });

    const expected = {
      index: 6,
      total: 10,
      prev: { _id: "a7", isVip: true },
      next: { _id: "a5", isVip: false },
    };
    expect(await locate("a4")).toEqual(expected);
    expect(await locate("a4", 6)).toEqual(expected);

    expect(await locate("a6")).toMatchObject({
      index: 4,
      prev: { _id: "a2" },
      next: { _id: "a7" },
    });
  });
});
