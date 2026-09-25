import { describe, expect, it, vi } from "vitest";
import {
  fetchTabCounts,
  type TabCountFetcher,
} from "../layers/dms-ui/app/build/composables/table-view/utils/tabCounts";

const LOCATION = "/api/saas/tables/workspaces";
const QUERIES = [
  { id: "all", query: {} },
  { id: "active", query: { "filter[status]": "active" } },
];

function fetcherReturning(respond: (url: string, options: unknown) => unknown) {
  return vi.fn(async (url: string, options: unknown) =>
    respond(url, options),
  ) as unknown as TabCountFetcher & ReturnType<typeof vi.fn>;
}

describe("fetchTabCounts", () => {
  it("counts every tab in one batch request by default", async () => {
    const fetcher = fetcherReturning(() => ({ all: 4, active: 1 }));

    const counts = await fetchTabCounts(undefined, LOCATION, QUERIES, fetcher);

    expect(counts).toEqual({ all: 4, active: 1 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(`${LOCATION}/count/batch`, {
      method: "POST",
      body: { queries: QUERIES },
    });
  });

  it("falls back to one count request per tab without the batch route", async () => {
    const fetcher = fetcherReturning((_url, options) => ({
      total: (options as { query: Record<string, unknown> }).query[
        "filter[status]"
      ]
        ? 1
        : 4,
    }));

    const counts = await fetchTabCounts("single", LOCATION, QUERIES, fetcher);

    expect(counts).toEqual({ all: 4, active: 1 });
    expect(fetcher).toHaveBeenCalledWith(`${LOCATION}/count`, {
      query: QUERIES[1]!.query,
    });
    expect(fetcher).not.toHaveBeenCalledWith(
      `${LOCATION}/count/batch`,
      expect.anything(),
    );
  });

  it("leaves out a tab whose single count fails", async () => {
    const fetcher = fetcherReturning((_url, options) => {
      if (
        (options as { query: Record<string, unknown> }).query["filter[status]"]
      )
        throw new Error("boom");
      return { total: 4 };
    });

    expect(await fetchTabCounts("single", LOCATION, QUERIES, fetcher)).toEqual({
      all: 4,
    });
  });

  it("requests nothing when the table exposes no count route", async () => {
    const fetcher = fetcherReturning(() => ({}));

    expect(await fetchTabCounts("none", LOCATION, QUERIES, fetcher)).toEqual(
      {},
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requests nothing without tabs", async () => {
    const fetcher = fetcherReturning(() => ({}));

    expect(await fetchTabCounts("batch", LOCATION, [], fetcher)).toEqual({});
    expect(fetcher).not.toHaveBeenCalled();
  });
});
