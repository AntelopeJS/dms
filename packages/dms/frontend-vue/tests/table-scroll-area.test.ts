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

  it("opens the scroll area from `maxHeight` alone", () => {
    expect(tableSource).not.toContain("stickyHeader");
    expect(tableSource).toMatch(
      /hasScrollArea = computed\(\(\) => !!props\.maxHeight\)/,
    );
    expect(tableSource).toMatch(/maxHeight: props\.maxHeight,/);
  });
});
