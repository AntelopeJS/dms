import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import {
  processSourceRows,
  sourceRouteQuery,
  useTableRows,
} from "../layers/dms-ui/app/entries/composables/table-view/useTableRows";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types";

interface LogRow extends Record<string, unknown> {
  _id: string;
  path: string;
  duration: number;
}

const ROWS: LogRow[] = [
  { _id: "a", path: "/api/orders", duration: 40 },
  { _id: "b", path: "/api/health", duration: 300 },
  { _id: "c", path: "/api/orders/42", duration: 120 },
];

// SAFETY: Source row processing only reads the column id and accessor key in these tests, not the form and display metadata.
const COLUMNS = [
  { id: "path", accessorKey: "path" },
  { id: "duration", accessorKey: "duration" },
] as TableViewColumn[];

type Api = Parameters<typeof useTableRows>[0]["api"];

interface PageRoute {
  params: Record<string, string>;
  query: ReturnType<
    NonNullable<Parameters<typeof useTableRows>[0]["route"]>
  >["routeQuery"];
}

describe("source tables", () => {
  it("sends the route only the part of the query it handles", () => {
    const query = {
      search: "orders",
      sortKey: "duration",
      sortDirection: "desc",
      offset: 10,
      limit: 10,
      filter_method: "is:GET",
      ids: "x",
    };
    expect(sourceRouteQuery(query, { filter: true })).toEqual({
      filter_method: "is:GET",
    });
    expect(sourceRouteQuery(query, { paginate: true, sort: true })).toEqual({
      sortKey: "duration",
      sortDirection: "desc",
      offset: 10,
      limit: 10,
    });
    expect(
      sourceRouteQuery(
        { ...query, showArchived: false },
        { filter: true, search: true, sort: true, paginate: true },
      ),
    ).not.toHaveProperty("showArchived");
  });

  it("searches, sorts and pages in the browser what the route left to it", () => {
    const page = processSourceRows(
      ROWS,
      {
        search: "ORDERS",
        sortKey: "duration",
        sortDirection: "desc",
        limit: 1,
      },
      {},
      COLUMNS,
    );
    expect(page.total).toBe(2);
    expect(page.results.map((row) => row._id)).toEqual(["c"]);
  });

  it("takes a paging route's page and total as they are", async () => {
    const api = vi.fn(async () => ({ results: ROWS.slice(0, 1), total: 120 }));
    const rows = useTableRows<LogRow>({
      // SAFETY: This mock only serves the list call below; the fetch client's raw/create methods are not used.
      api: api as Api,
      location: "/api/log",
      source: { fetchUrl: "/api/log", capabilities: { paginate: true } },
      columns: COLUMNS,
    });
    const page = await rows.list({ offset: 20, limit: 10, search: "x" });
    expect(api).toHaveBeenCalledWith("/api/log", {
      query: { offset: 20, limit: 10 },
      signal: expect.any(AbortSignal),
    });
    expect(page).toMatchObject({ total: 120, offset: 20, limit: 10 });
    expect(await rows.getRow("a")).toBeUndefined();
  });

  it("counts a source's tabs one list at a time, and a controller's in one batch", async () => {
    const sourceApi = vi.fn(async () => ({ results: ROWS, total: 3 }));
    const source = useTableRows<LogRow>({
      // SAFETY: The source only lists these LogRow fixtures; no other fetch client methods are used.
      api: sourceApi as Api,
      location: "/api/log",
      source: { fetchUrl: "/api/log", capabilities: {} },
      columns: COLUMNS,
    });
    expect(
      await source.countBatch([
        { id: "all", query: {} },
        { id: "orders", query: { search: "orders" } },
      ]),
    ).toEqual({ all: 3, orders: 2 });

    const controllerApi = vi.fn(async () => ({ all: 7 }));
    const controller = useTableRows<LogRow>({
      // SAFETY: This controller mock only answers the count/batch call below.
      api: controllerApi as Api,
      location: "/api/runs",
      columns: COLUMNS,
    });
    await controller.countBatch([{ id: "all", query: {} }]);
    expect(controllerApi).toHaveBeenCalledWith("/api/runs/count/batch", {
      method: "POST",
      body: { queries: [{ id: "all", query: {} }] },
    });
  });

  describe("with a templated fetchUrl", () => {
    const FETCH_URL = "/api/ws/{{params.id}}/requests?route={{query.route}}";

    function sourceRows(route: PageRoute) {
      const api = vi.fn(async (_url: string) => ({ results: ROWS, total: 3 }));
      const rows = useTableRows<LogRow>({
        // SAFETY: This source only lists the LogRow fixtures through the callable fetch interface.
        api: api as Api,
        location: FETCH_URL,
        source: { fetchUrl: FETCH_URL, capabilities: {} },
        columns: COLUMNS,
        route: () => ({ routeParams: route.params, routeQuery: route.query }),
      });
      return { api, rows };
    }

    it("requests the page's URL, its values encoded", async () => {
      const { api, rows } = sourceRows({
        params: { id: "ws-1" },
        query: { route: "GET /api/a?b=c" },
      });
      await rows.list({});
      expect(api).toHaveBeenCalledWith(
        "/api/ws/ws-1/requests?route=GET%20%2Fapi%2Fa%3Fb%3Dc",
        { query: {}, signal: expect.any(AbortSignal) },
      );
    });

    it("requests nothing, and lists nothing, while a token has no value", async () => {
      const { api, rows } = sourceRows({ params: { id: "ws-1" }, query: {} });
      expect(rows.sourceUrl.value).toBe(undefined);
      expect(await rows.list({ offset: 10, limit: 10 })).toEqual({
        results: [],
        total: 0,
        offset: 10,
        limit: 10,
      });
      expect(
        await rows.countBatch([{ id: "orders", query: { search: "orders" } }]),
      ).toEqual({ orders: 0 });
      expect(api).not.toHaveBeenCalled();
    });

    it("follows the page URL, tab counters included", async () => {
      const route = reactive<PageRoute>({
        params: { id: "ws-1" },
        query: { route: "GET /a" },
      });
      const { api, rows } = sourceRows(route);
      await rows.list({});
      route.query = { route: "POST /b" };
      expect(rows.sourceUrl.value).toBe(
        "/api/ws/ws-1/requests?route=POST%20%2Fb",
      );
      await rows.countBatch([{ id: "all", query: {} }]);
      expect(api.mock.calls.map(([url]) => url)).toEqual([
        "/api/ws/ws-1/requests?route=GET%20%2Fa",
        "/api/ws/ws-1/requests?route=POST%20%2Fb",
      ]);
    });
  });

  describe("reading one row (fetchRowUrl)", () => {
    const FETCH_URL = "/api/ws/{{params.ws}}/requests";
    const ROW_URL = "/api/ws/{{params.ws}}/requests/{{row.id}}";

    function rowsWith(
      api: (url: string) => Promise<LogRow | undefined>,
      fetchRowUrl?: string,
    ) {
      return useTableRows<LogRow>({
        // SAFETY: These tests only request one LogRow by URL, not the fetch client's other methods.
        api: api as Api,
        location: FETCH_URL,
        source: { fetchUrl: FETCH_URL, fetchRowUrl, capabilities: {} },
        columns: COLUMNS,
        route: () => ({ routeParams: { ws: "ws-1" }, routeQuery: {} }),
      });
    }

    it("reads a row by id, its id and the page's tokens filled", async () => {
      const api = vi.fn(async () => ROWS[2]);
      const rows = rowsWith(api, ROW_URL);
      expect(await rows.getRow("c/42")).toBe(ROWS[2]);
      expect(api).toHaveBeenCalledWith("/api/ws/ws-1/requests/c%2F42");
    });

    it("rejects as the route does on a missing row", async () => {
      const api = vi.fn(async () => {
        throw Object.assign(new Error("Not Found"), { statusCode: 404 });
      });
      await expect(rowsWith(api, ROW_URL).getRow("gone")).rejects.toThrow(
        "Not Found",
      );
    });

    it("requests nothing without fetchRowUrl", async () => {
      const api = vi.fn(async () => ROWS[0]);
      expect(await rowsWith(api).getRow("a")).toBeUndefined();
      expect(api).not.toHaveBeenCalled();
    });
  });
});
