/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { withQuery } from "ufo";
import { createApp } from "vue";
import {
  $fetch,
  createDmsFrontendRuntime,
  provideDmsFrontendRuntime,
} from "#dms/frontend-module";
import { useTableRows } from "../layers/dms-ui/app/entries/composables/table-view/useTableRows";

const LOCATION = "https://backend.test/api/invoices";
const targets: URL[] = [];
const methods: string[] = [];

function controller() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      targets.push(url);
      methods.push(init?.method ?? "GET");
      const counts = Object.fromEntries(
        url.searchParams
          .getAll("query")
          .map((entry, index) => [
            decodeURIComponent(entry.slice(0, entry.indexOf("?"))),
            index + targets.length,
          ]),
      );
      return new Response(JSON.stringify(counts), {
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const app = createApp({});
  provideDmsFrontendRuntime(app, createDmsFrontendRuntime());
  const rows = useTableRows({ api: $fetch, location: LOCATION, columns: [] });
  return {
    countBatch: (...args: Parameters<typeof rows.countBatch>) =>
      app.runWithContext(() => rows.countBatch(...args)),
  };
}

afterEach(() => {
  targets.length = 0;
  methods.length = 0;
  vi.unstubAllGlobals();
});

it("round-trips arbitrary ids, repeated filters, false and zero through the real renderer URL without a GET body", async () => {
  const rows = controller();
  const id = "why?50% & é";
  const result = await rows.countBatch([
    {
      id,
      query: {
        search: "? & + % é",
        filter_status: ["is:open", "is_not:paid"],
        limit: 0,
        showArchived: false,
        omitted: undefined,
      },
    },
  ]);
  const entry = targets[0]!.searchParams.getAll("query")[0]!;
  const separator = entry.indexOf("?");
  expect(decodeURIComponent(entry.slice(0, separator))).toBe(id);
  const query = new URLSearchParams(entry.slice(separator + 1));
  expect([...query]).toEqual([
    ["search", "? & + % é"],
    ["filter_status", "is:open"],
    ["filter_status", "is_not:paid"],
    ["limit", "0"],
    ["showArchived", "false"],
  ]);
  expect(methods).toEqual(["GET"]);
  expect(result).toEqual({ [id]: 1 });
});

it("packs an approximately 11.5 KB page into two bounded GETs and merges distinct counts", async () => {
  const rows = controller();
  const queries = Array.from({ length: 50 }, (_, index) => ({
    id: `group-${index}`,
    query: { search: "x".repeat(170), filter_status: "is:open" },
  }));
  const unpacked = withQuery(`${LOCATION}/count/batch`, {
    query: queries.map(
      ({ id, query }) => `${id}?search=${query.search}&filter_status=is%3Aopen`,
    ),
  });
  const size = new URL(unpacked);
  expect(size.pathname.length + size.search.length).toBeGreaterThan(11_000);
  expect(size.pathname.length + size.search.length).toBeLessThan(12_000);
  const result = await rows.countBatch(queries);
  expect(targets).toHaveLength(2);
  expect(
    targets.every(
      (url) =>
        new TextEncoder().encode(url.pathname + url.search).length <= 8_192,
    ),
  ).toBe(true);
  expect(Object.keys(result)).toEqual(queries.map(({ id }) => id));
  expect(result["group-0"]).toBe(1);
  expect(result["group-49"]).toBe(
    targets[1]!.searchParams.getAll("query").length + 1,
  );
});

it("keeps a single oversized entry on GET and forwards aborts instead of falling back to POST", async () => {
  const rows = controller();
  await rows.countBatch([
    { id: "large", query: { search: "x".repeat(9_000) } },
  ]);
  expect(targets).toHaveLength(1);
  expect(methods).toEqual(["GET"]);
  const abort = new AbortController();
  abort.abort();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: string, init?: RequestInit) => {
      if (init?.signal?.aborted) throw init.signal.reason;
      throw new Error("Abort signal missing");
    }),
  );
  await expect(
    rows.countBatch([{ id: "all", query: {} }], abort.signal),
  ).rejects.toThrow();
});
