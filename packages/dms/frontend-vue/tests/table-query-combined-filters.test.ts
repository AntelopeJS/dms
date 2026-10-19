/**
 * The list query carries one filter per column. A tab (a hidden filter) and
 * a column filter (the filters row, a saved view) on the same column are
 * combined: the column filter is sent only when it keeps a subset of the
 * tab's rows, else the tab's filter is — a tab never shows rows it excludes.
 */
import { describe, expect, it } from "vitest";
import { buildTableQuery } from "../layers/dms-ui/app/build/composables/table-view/utils/tableQuery";
import type { TableFilter } from "../layers/dms-ui/app/build/components/table/Table.vue";

const filter = (accessorKey: string, mode: string, value?: unknown) =>
  ({ accessorKey, mode, value }) as TableFilter;

const query = (hiddenFilters: TableFilter[], columnFilters: TableFilter[]) =>
  buildTableQuery({
    pagination: { pageIndex: 0, pageSize: 10 },
    sorting: [],
    hiddenFilters,
    columnFilters,
  });

describe("a tab combined with a view's filters", () => {
  it("keeps the tab's filter over a view's filter on the same column", () => {
    const result = query(
      [filter("status", "is", "overdue")],
      [
        filter("status", "is", "paid"),
        filter("paidAt", "greater_than", "{{now-30d}}"),
      ],
    );
    expect(result).toMatchObject({
      filter_status: "is:overdue",
      filter_paidAt: "greater_than:{{now-30d}}",
    });
  });

  it("sends a column filter that narrows the tab's", () => {
    expect(
      query(
        [filter("status", "is_not", "archived")],
        [filter("status", "is", "paid")],
      ).filter_status,
    ).toBe("is:paid");
    expect(
      query(
        [filter("ownerId", "is_not_empty")],
        [filter("ownerId", "is", "u1")],
      ).filter_ownerId,
    ).toBe("is:u1");
  });

  it("keeps the tab's filter when the column filter would widen it", () => {
    expect(
      query(
        [filter("status", "is_not", "paid")],
        [filter("status", "is", "paid")],
      ).filter_status,
    ).toBe("is_not:paid");
    expect(
      query(
        [filter("status", "is", "paid")],
        [filter("status", "is_not", "draft")],
      ).filter_status,
    ).toBe("is:paid");
  });

  it("sends each filter as is on distinct columns", () => {
    expect(
      query([filter("status", "is", "open")], [filter("team", "is", "a")]),
    ).toMatchObject({ filter_status: "is:open", filter_team: "is:a" });
  });
});
