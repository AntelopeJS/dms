/**
 * `pinnedRows`: the rows a rule accepts lead the list whatever the sort — the
 * base language of a languages table stays on top whichever column the user
 * sorts on, and on the first page.
 */
import { describe, expect, it, vi } from "vitest";
import {
  processSourceRows,
  useTableRows,
} from "../layers/dms-ui/app/build/composables/table-view/useTableRows";
import { pinRows } from "../layers/dms-ui/app/build/composables/table-view/utils/pinnedRows";
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
] as TableViewColumn[];

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
      api: api as unknown as Api,
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
      api: api as unknown as Api,
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
