import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tv } from "tailwind-variants";
import { EYEBROW_CLASS } from "../layers/dms-ui/app/build/utils/eyebrow";
import { horizontalScrollEdges } from "../layers/dms-ui/app/build/composables/table/utils/scrollEdges";
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

describe("Table scroll area", () => {
  it("sticks the header band to the top of its own scroll area", () => {
    const ui = theme({ scrollArea: true });
    expect(ui.tableRoot()).toContain("overflow-y-auto");
    expect(ui.headCell()).toContain("sticky");
    expect(ui.headCell()).toContain("top-0");
  });

  it("leaves a table without a scroll area unstuck", () => {
    expect(theme().headCell()).not.toContain("sticky");
    expect(theme().tableRoot()).not.toContain("overflow-y-auto");
  });
});

describe("Table horizontal scroll fades", () => {
  const area = (scrollLeft: number, scrollWidth = 1250, clientWidth = 340) => ({
    scrollLeft,
    scrollWidth,
    clientWidth,
  });

  it("fades the sides that still hide columns", () => {
    expect(horizontalScrollEdges(area(0))).toEqual({ start: false, end: true });
    expect(horizontalScrollEdges(area(400))).toEqual({
      start: true,
      end: true,
    });
    expect(horizontalScrollEdges(area(910))).toEqual({
      start: true,
      end: false,
    });
    // A right-to-left page scrolls to negative positions.
    expect(horizontalScrollEdges(area(-400))).toEqual({
      start: true,
      end: true,
    });
  });

  it("fades nothing on a table that fits its card", () => {
    expect(horizontalScrollEdges(area(0, 340.5, 340))).toEqual({
      start: false,
      end: false,
    });
  });

  it("draws each fade as an inset shadow on its own side", () => {
    expect(theme().scrollFrame()).toContain("relative");
    expect(theme({ side: "start" }).scrollFade()).toContain("inset_12px");
    expect(theme({ side: "end" }).scrollFade()).toContain("inset_-12px");
    expect(tableSource).toContain('data-table-scroll-fade="end"');
  });
});
