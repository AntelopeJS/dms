import { describe, expect, it, vi } from "vitest";
import {
  processSourceRows,
  sourceRouteQuery,
  useTableRows,
} from "../layers/dms-ui/app/build/composables/table-view/useTableRows";
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

const COLUMNS = [
  { id: "path", accessorKey: "path" },
  { id: "duration", accessorKey: "duration" },
] as TableViewColumn[];

type Api = Parameters<typeof useTableRows>[0]["api"];

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
      ids: "x",
    });
    expect(sourceRouteQuery(query, { paginate: true, sort: true })).toEqual({
      sortKey: "duration",
      sortDirection: "desc",
      offset: 10,
      limit: 10,
      ids: "x",
    });
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
      api: api as unknown as Api,
      location: "/api/log",
      source: { fetchUrl: "/api/log", capabilities: { paginate: true } },
      columns: COLUMNS,
    });
    const page = await rows.list({ offset: 20, limit: 10, search: "x" });
    expect(api).toHaveBeenCalledWith("/api/log", {
      query: { offset: 20, limit: 10 },
    });
    expect(page).toMatchObject({ total: 120, offset: 20, limit: 10 });
    expect(await rows.getRow("a")).toBeUndefined();
  });

  it("counts a source's tabs one list at a time, and a controller's in one batch", async () => {
    const sourceApi = vi.fn(async () => ({ results: ROWS, total: 3 }));
    const source = useTableRows<LogRow>({
      api: sourceApi as unknown as Api,
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
      api: controllerApi as unknown as Api,
      location: "/api/runs",
      columns: COLUMNS,
    });
    await controller.countBatch([{ id: "all", query: {} }]);
    expect(controllerApi).toHaveBeenCalledWith("/api/runs/count/batch", {
      method: "POST",
      body: { queries: [{ id: "all", query: {} }] },
    });
  });
});
