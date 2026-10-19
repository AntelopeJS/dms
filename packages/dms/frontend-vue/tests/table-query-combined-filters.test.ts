/**
 * The list query carries one filter per column. A tab (a hidden filter) and
 * a column filter (the filters row, a saved view) on the same column are
 * combined (AND): the column filter is sent when it keeps a subset of the
 * tab's rows, the query lists no rows when they cannot both hold, and the
 * tab's filter is sent otherwise — a tab never shows rows it excludes.
 */
import { describe, expect, it } from "vitest";
import {
  buildTableQuery,
  isNoRowsQuery,
} from "../layers/dms-ui/app/build/composables/table-view/utils/tableQuery";
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
  it("lists no rows when the view pins the tab's column to another value", () => {
    // A view "Expiring this week" (status sent) under a tab "Accepted".
    const result = query(
      [filter("status", "is", "accepted")],
      [
        filter("status", "is", "sent"),
        filter("validUntil", "less_than", "{{now+7d}}"),
      ],
    );
    expect(isNoRowsQuery(result)).toBe(true);
    expect(result).toMatchObject({
      filter_status: "is:accepted",
      filter_validUntil: "less_than:{{now+7d}}",
    });
  });

  it("lists no rows for any pair of filters no row passes", () => {
    const disjoint: Array<[TableFilter, TableFilter]> = [
      [filter("status", "is", "paid"), filter("status", "is", "draft")],
      [filter("status", "is_not", "paid"), filter("status", "is", "paid")],
      [filter("status", "is", "paid"), filter("status", "is_not", "paid")],
      [filter("ownerId", "is_empty"), filter("ownerId", "is", "u1")],
      [filter("ownerId", "is_not_empty"), filter("ownerId", "is_empty")],
      [filter("tags", "include", ["a", "b"]), filter("tags", "is", "c")],
      [filter("tags", "exclude", ["a"]), filter("tags", "is", "a")],
      [filter("tags", "include", ["a"]), filter("tags", "include", ["b"])],
      [filter("tags", "include", ["a"]), filter("tags", "is_empty")],
    ];
    for (const [hidden, column] of disjoint) {
      expect(isNoRowsQuery(query([hidden], [column]))).toBe(true);
    }
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
    expect(
      query(
        [filter("tags", "include", ["a", "b"])],
        [filter("tags", "is", "b")],
      ).filter_tags,
    ).toBe("is:b");
    expect(
      isNoRowsQuery(
        query(
          [filter("status", "is_not", "archived")],
          [filter("status", "is", "paid")],
        ),
      ),
    ).toBe(false);
  });

  it("keeps the tab's filter when it narrows the column filter", () => {
    expect(
      query(
        [filter("status", "is", "paid")],
        [filter("status", "is_not", "draft")],
      ).filter_status,
    ).toBe("is:paid");
    expect(
      query(
        [filter("status", "is", "paid")],
        [filter("status", "is_not", "draft")],
      ),
    ).not.toHaveProperty("noRows");
  });

  it("keeps the tab's filter when it cannot tell how the two combine", () => {
    const result = query(
      [filter("title", "contains", "roof")],
      [filter("title", "is", "Solar")],
    );
    expect(result.filter_title).toBe("contains:roof");
    expect(isNoRowsQuery(result)).toBe(false);
  });

  it("sends each filter as is on distinct columns", () => {
    const result = query(
      [filter("status", "is", "open")],
      [filter("team", "is", "a")],
    );
    expect(result).toMatchObject({ filter_status: "is:open", filter_team: "is:a" });
    expect(isNoRowsQuery(result)).toBe(false);
  });
});
