/**
 * A list query whose filters keep no row (a tab and a view pinning one
 * column to different values) requests nothing: the list is empty and its
 * counters read 0, while the other counters of the batch are still asked.
 */
import { computed } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types";

vi.stubGlobal("computed", computed);

const { useTableRows } = await import(
  "../layers/dms-ui/app/build/composables/table-view/useTableRows"
);
const { NO_ROWS_QUERY_KEY } = await import(
  "../layers/dms-ui/app/build/composables/table-view/utils/tableQuery"
);

const LOCATION = "/api/quotes";
const COLUMNS = [{ id: "status", accessorKey: "status" }] as TableViewColumn[];
const NO_ROWS = { filter_status: "is:accepted", [NO_ROWS_QUERY_KEY]: true };

interface Call {
  url: string;
  body?: { queries: Array<{ id: string }> };
}

const calls: Call[] = [];
const api = (async (url: string, options: Omit<Call, "url"> = {}) => {
  calls.push({ url, ...options });
  return url.endsWith("/count/batch")
    ? Object.fromEntries(options.body!.queries.map(({ id }) => [id, 3]))
    : { results: [{ _id: "q1" }], total: 1, offset: 0, limit: 10 };
}) as never;

const rows = () =>
  useTableRows({ api, location: LOCATION, columns: COLUMNS });

beforeEach(() => {
  calls.length = 0;
});

describe("a list query that keeps no row", () => {
  it("lists no rows without a request", async () => {
    const page = await rows().list({ ...NO_ROWS, offset: 0, limit: 10 });
    expect(page).toMatchObject({ results: [], total: 0 });
    expect(calls).toHaveLength(0);
  });

  it("counts 0 and asks only the other counters", async () => {
    const counts = await rows().countBatch([
      { id: "view:expiring", query: NO_ROWS },
      { id: "accepted", query: { filter_status: "is:accepted" } },
    ]);
    expect(counts).toEqual({ "view:expiring": 0, accepted: 3 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body!.queries.map(({ id }) => id)).toEqual(["accepted"]);
  });

  it("requests nothing when every counter keeps no row", async () => {
    expect(
      await rows().countBatch([{ id: "view:expiring", query: NO_ROWS }]),
    ).toEqual({ "view:expiring": 0 });
    expect(calls).toHaveLength(0);
  });
});
