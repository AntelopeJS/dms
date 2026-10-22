import { describe, expect, it } from "vitest";
import {
  FULL_TABLE_CHROME,
  resolveTableChrome,
} from "../layers/dms-ui/app/build/composables/table-view/utils/chrome";
import {
  applyQuickFilter,
  quickFilterButtonLabel,
  quickFilterValue,
  quickFilterMode,
  relationQuickFilterItems,
  relationQuickFilterSource,
  staticQuickFilterItems,
} from "../layers/dms-ui/app/build/composables/table-view/utils/quickFilters";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types/column";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { relationSelectSource } from "../layers/dms-ui/app/build/composables/data-types/relationRows";

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

const dataTypes = (id: string): DataType | undefined =>
  id === "relation" ? { id, selectSource: relationSelectSource } : undefined;

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

  it("reduces the compact layout to an open search field and the page size picker", () => {
    expect(resolveTableChrome("compact", everything)).toEqual({
      caption: false,
      search: "field",
      filters: false,
      sorting: false,
      refresh: false,
      menu: false,
      columnMenus: false,
      pageSize: true,
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

  it("reads a relation's values from the select source its data type names", () => {
    const relation = column("relation", {
      multiple: true,
      searchUrl: "/api/roles/select",
      keyMapping: { label: "title" },
    });
    expect(staticQuickFilterItems(relation, translate)).toBe(undefined);
    const source = relationQuickFilterSource(relation, dataTypes)!;
    expect(source).toEqual({
      searchUrl: "/api/roles/select",
      keyMapping: { label: "title" },
    });
    // The value key is not mapped: the route's `value`, as the picker reads.
    expect(
      relationQuickFilterItems(
        [{ value: "r1", title: "Admin", _id: "x" }, { title: "no id" }],
        source,
      ),
    ).toEqual([{ value: "r1", label: "Admin" }]);
  });

  it("names a relation's values by the route's label and value keys by default", () => {
    const source = relationQuickFilterSource(
      column("relation", { searchUrl: "/api/customers/select" }),
      dataTypes,
    )!;
    expect(
      relationQuickFilterItems(
        [{ value: "cust-060", label: "Acme", _id: "row", name: "other" }],
        source,
      ),
    ).toEqual([{ value: "cust-060", label: "Acme" }]);
  });

  it("fetches values only for a type that declares a select source", () => {
    const searchable = column("custom_picker", { searchUrl: "/api/x/select" });
    expect(relationQuickFilterSource(searchable, dataTypes)).toBe(undefined);
  });

  it("matches inside a list for a multiple column, by equality otherwise", () => {
    expect(quickFilterMode(column("relation", { multiple: true }))).toBe(
      "array_contains_string",
    );
    expect(quickFilterMode(column("select"))).toBe("is");
    expect(quickFilterMode(column("select"), "is_not")).toBe("is_not");
  });

  const roles = { field: "roleIds", mode: "array_contains_string" } as const;
  const dueDate = {
    accessorKey: "dueDate",
    mode: "before",
    value: "2026-01-01",
    pinned: false,
  };

  it("writes the picked value as the column's own filter", () => {
    const filters = applyQuickFilter([dueDate], roles, "r1");
    expect(filters).toEqual([
      dueDate,
      {
        accessorKey: "roleIds",
        mode: "array_contains_string",
        value: "r1",
        pinned: false,
      },
    ]);
    expect(quickFilterValue(filters, roles)).toBe("r1");
    expect(applyQuickFilter(filters, roles, "r2")).toHaveLength(2);
    expect(
      quickFilterValue(applyQuickFilter(filters, roles, "r2"), roles),
    ).toBe("r2");
  });

  it("clears its filter on All, leaving the others", () => {
    const filters = applyQuickFilter([dueDate], roles, "r1");
    expect(applyQuickFilter(filters, roles, undefined)).toEqual([dueDate]);
    expect(quickFilterValue([dueDate], roles)).toBe(undefined);
  });

  it("sets a default filter on the column rather than adding a second one", () => {
    const pinned = {
      accessorKey: "roleIds",
      mode: "array_contains_string",
      value: undefined,
      pinned: true,
      initialValue: undefined,
    };
    expect(applyQuickFilter([pinned], roles, "r1")).toEqual([
      { ...pinned, value: "r1" },
    ]);
  });

  it("names the column and its value on the button of a table without filters row", () => {
    const role = {
      ...roles,
      label: "Role",
      icon: "i-ph-funnel",
      allLabel: "All",
      items: [{ value: "r1", label: "Admin" }],
    };
    const filters = applyQuickFilter([], role, "r1");
    expect(quickFilterButtonLabel(role, [], false)).toBe("Role");
    expect(quickFilterButtonLabel(role, filters, true)).toBe("Admin");
    expect(quickFilterButtonLabel(role, filters, false)).toBe("Role: Admin");
  });
});
