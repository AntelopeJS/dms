import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tv } from "tailwind-variants";
import { EYEBROW_CLASS } from "../layers/dms-ui/app/build/utils/eyebrow";
import { REORDER_HANDLE_CLASS } from "../layers/dms-ui/app/build/composables/table-view/useReorderHandles";

const tableSource = readFileSync(
  new URL(
    "../layers/dms-ui/app/build/components/table/Table.vue",
    import.meta.url,
  ),
  "utf8",
);
const themeSource = tableSource.slice(
  tableSource.indexOf("const PANEL_MATCH_BG"),
  tableSource.indexOf("// Grid-like default"),
);
const theme = new Function(
  "tv",
  "EYEBROW_CLASS",
  "REORDER_HANDLE_CLASS",
  `${themeSource}; return theme;`,
)(tv, EYEBROW_CLASS, REORDER_HANDLE_CLASS);

describe("Table grid cell layout theme", () => {
  it.each([undefined, false])("preserves the default for %s", (cellWrap) => {
    expect(theme().rowSpan({ cellWrap })).toBe("line-clamp-1 text-ellipsis");
  });

  it("removes the clamp and inherited nowrap only for opted-in cells", () => {
    const classes = theme().rowSpan({ cellWrap: true });
    expect(classes).toContain("line-clamp-none");
    expect(classes).toContain("whitespace-normal");
    expect(classes).toContain("[overflow-wrap:anywhere]");
    expect(classes).not.toContain("line-clamp-1");
    expect(theme().rowSpan()).toBe("line-clamp-1 text-ellipsis");
  });

  it("preserves pinned cell and table layout classes", () => {
    expect(theme({ cellWrap: true }).table()).toBe(theme().table());
    expect(theme({ cellWrap: true }).rowCell({ pinned: "left" })).toBe(
      theme().rowCell({ pinned: "left" }),
    );
  });

  it("reads each column's policy inside the default slot fallback", () => {
    expect(tableSource).toMatch(
      /uiTable\.rowSpan\(\{\s*cellWrap: \(\s*cell\.column\.columnDef as TableColumn<T>\s*\)\.cellWrap[\s,]*\}\)/,
    );
  });
});
