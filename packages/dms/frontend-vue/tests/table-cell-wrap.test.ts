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
    const pinned = theme().rowCell({ pinned: "left" }).split(" ");
    const wrapped = theme()
      .rowCell({ pinned: "left", cellWrap: true })
      .split(" ");
    expect(wrapped.filter((name: string) => !pinned.includes(name))).toEqual([
      "py-2.5",
    ]);
    expect(pinned.filter((name: string) => !wrapped.includes(name))).toEqual([
      "py-0",
    ]);
  });

  it("pads only a wrapped cell, so its lines clear the row's hairlines", () => {
    expect(theme().rowCell({ cellWrap: true })).toContain("py-2.5");
    expect(theme().rowCell({ cellWrap: true })).toContain("h-11");
    expect(theme().rowCell({ cellWrap: true })).not.toContain("py-0");
    for (const cellWrap of [undefined, false]) {
      expect(theme().rowCell({ cellWrap })).toContain("py-0");
    }
  });
});
