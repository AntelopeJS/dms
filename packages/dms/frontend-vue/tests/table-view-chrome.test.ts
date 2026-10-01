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

describe("TableView chrome", () => {
  it("draws the full chrome by default", () => {
    expect(resolveTableChrome(undefined)).toEqual(FULL_TABLE_CHROME);
    expect(resolveTableChrome("full").search).toBe("toggle");
  });

  it("reduces the minimal preset to an open search field", () => {
    expect(resolveTableChrome("minimal")).toEqual({
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

  it("lays toggles over a preset", () => {
    const chrome = resolveTableChrome({
      preset: "minimal",
      caption: true,
      search: false,
    });
    expect(chrome.caption).toBe(true);
    expect(chrome.search).toBe("none");
    expect(chrome.menu).toBe(false);
    expect(resolveTableChrome({ menu: false }).filters).toBe(true);
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
