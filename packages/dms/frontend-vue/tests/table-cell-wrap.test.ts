import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tv } from "tailwind-variants";

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
const theme = new Function("tv", `${themeSource}; return theme;`)(tv);

describe("Table grid cell layout theme", () => {
  it.each([undefined, false])("preserves the default for %s", (cellWrap) => {
    expect(theme().rowSpan({ cellWrap })).toBe("line-clamp-1");
  });

  it("removes the clamp and inherited nowrap only for opted-in cells", () => {
    const classes = theme().rowSpan({ cellWrap: true });
    expect(classes).toContain("line-clamp-none");
    expect(classes).toContain("whitespace-normal");
    expect(classes).toContain("[overflow-wrap:anywhere]");
    expect(classes).not.toContain("line-clamp-1");
    expect(theme().rowSpan()).toBe("line-clamp-1");
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
