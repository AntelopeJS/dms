import { describe, expect, it } from "vitest";
import { selectionScopeKey } from "../layers/dms-ui/app/build/utils/selectionScope";

const STATUS_FILTER = { accessorKey: "status", mode: "is", value: "open" };
const TAB_FILTER = { accessorKey: "isRead", mode: "is", value: "false" };

describe("selectionScopeKey", () => {
  const base = { columnFilters: [], hiddenFilters: [], globalFilter: "" };
  const key = selectionScopeKey(base);

  it("changes with a filter, the search or the tab", () => {
    expect(
      selectionScopeKey({ ...base, columnFilters: [STATUS_FILTER] }),
    ).not.toBe(key);
    expect(selectionScopeKey({ ...base, globalFilter: "acme" })).not.toBe(key);
    expect(
      selectionScopeKey({ ...base, hiddenFilters: [TAB_FILTER] }),
    ).not.toBe(key);
  });

  it("reads no search and an empty one alike", () => {
    expect(selectionScopeKey({ ...base, globalFilter: undefined })).toBe(key);
  });
});
