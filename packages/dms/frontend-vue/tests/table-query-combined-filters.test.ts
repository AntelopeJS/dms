import { describe, expect, it } from "vitest";
import { buildTableQuery } from "../layers/dms-ui/app/build/composables/table-view/utils/tableQuery";
import type { TableFilter } from "../layers/dms-ui/app/build/components/table/Table.vue";

const filter = (accessorKey: string, mode: string, value: string) =>
  ({ accessorKey, mode, value }) as TableFilter;

const query = (hidden: TableFilter[], column: TableFilter[]) =>
  buildTableQuery({
    pagination: { pageIndex: 0, pageSize: 10 },
    sorting: [],
    columnFilters: column,
    hiddenFilters: hidden,
  });

describe("tab and view filters on one column", () => {
  it("sends both, the tab's first", () => {
    expect(
      query(
        [filter("status", "is_not", "paid")],
        [filter("status", "is", "sent")],
      ).filter_status,
    ).toEqual(["is_not:paid", "is:sent"]);
  });

  it("sends a filter once when both are equal", () => {
    expect(
      query([filter("status", "is", "sent")], [filter("status", "is", "sent")])
        .filter_status,
    ).toBe("is:sent");
  });

  it("keeps filters on other columns as they are", () => {
    const result = query(
      [filter("status", "is", "open")],
      [filter("owner", "is", "u1")],
    );
    expect(result.filter_status).toBe("is:open");
    expect(result.filter_owner).toBe("is:u1");
  });
});
