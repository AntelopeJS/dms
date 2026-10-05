import { describe, expect, it } from "vitest";
import {
  FULL_TABLE_CHROME,
  resolveTableChrome,
} from "../layers/dms-ui/app/build/composables/table-view/utils/chrome";
import {
  quickFilterFilters,
  quickFilterMode,
  relationQuickFilterItems,
  relationQuickFilterSource,
  staticQuickFilterItems,
} from "../layers/dms-ui/app/build/composables/table-view/utils/quickFilters";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types/column";

const column = (
  id: string,
  options: Record<string, unknown> = {},
): TableViewColumn =>
  ({
    id,
    accessorKey: id,
    header: id,
    listable: true,
    type: { id, inputComponent: { componentName: "x", options } },
  }) as unknown as TableViewColumn;

describe("TableView layout", () => {
  const everything = {
    hasCaption: true,
    isSearchable: true,
    isFilterable: true,
  };

  it("draws the full chrome by default", () => {
    expect(resolveTableChrome(undefined, everything)).toEqual(
      FULL_TABLE_CHROME,
    );
    expect(resolveTableChrome("full", everything).search).toBe("toggle");
  });

  it("reduces the compact layout to an open search field", () => {
    expect(resolveTableChrome("compact", everything)).toEqual({
      caption: false,
      search: "field",
      filters: false,
      sorting: false,
      refresh: false,
      menu: false,
      columnMenus: false,
      pageSize: false,
    });
  });

  it("draws a control only when the table has something to offer through it", () => {
    const bare = resolveTableChrome("full", {
      hasCaption: false,
      isSearchable: false,
      isFilterable: false,
    });
    expect(bare.caption).toBe(false);
    expect(bare.search).toBe("none");
    expect(bare.filters).toBe(false);
    expect(bare.menu).toBe(true);
    expect(
      resolveTableChrome("compact", { ...everything, isSearchable: false })
        .search,
    ).toBe("none");
  });
});

describe("TableView quick filters", () => {
  const translate = (key: string) => key.replace(/^\$/, "t:");

  it("lists a select's items and a boolean's two values", () => {
    expect(
      staticQuickFilterItems(
        column("select", { items: [{ value: 1, label: "$one" }] }),
        translate,
      ),
    ).toEqual([{ value: "1", label: "t:one" }]);
    expect(
      staticQuickFilterItems(column("boolean"), translate)?.map((i) => i.value),
    ).toEqual(["true", "false"]);
  });

  it("reads a relation's values from its select endpoint", () => {
    const relation = column("relation", {
      multiple: true,
      searchUrl: "/api/roles/select",
      keyMapping: { label: "title", value: "_id" },
    });
    expect(staticQuickFilterItems(relation, translate)).toBe(undefined);
    const source = relationQuickFilterSource(relation)!;
    expect(source).toEqual({
      url: "/api/roles/select",
      labelKey: "title",
      valueKey: "_id",
    });
    expect(
      relationQuickFilterItems(
        [{ _id: "r1", title: "Admin" }, { title: "no id" }],
        source,
      ),
    ).toEqual([{ value: "r1", label: "Admin" }]);
  });

  it("matches inside a list for a multiple column, by equality otherwise", () => {
    expect(quickFilterMode(column("relation", { multiple: true }))).toBe(
      "array_contains_string",
    );
    expect(quickFilterMode(column("select"))).toBe("is");
    expect(quickFilterMode(column("select"), "contains")).toBe("contains");
  });

  it("turns picked values into hidden filters", () => {
    expect(
      quickFilterFilters(
        [
          { field: "roleIds", mode: "array_contains_string" },
          { field: "status", mode: "is" },
        ],
        { roleIds: "r1", status: undefined },
      ),
    ).toEqual([
      { accessorKey: "roleIds", mode: "array_contains_string", value: "r1" },
    ]);
  });
});
