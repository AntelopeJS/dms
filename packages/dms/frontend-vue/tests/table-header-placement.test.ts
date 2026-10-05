import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tableSource = readFileSync(
  resolve(__dirname, "../layers/dms-ui/app/build/components/table/Table.vue"),
  "utf8",
);

describe("Table buttons placed in the page header", () => {
  it("leaves them out of the toolbar", () => {
    expect(tableSource).toMatch(
      /\(props\.customButtons \?\? \[\]\)\.filter\(\s*\(button\) => button\.placement !== HEADER_PLACEMENT,\s*\)/,
    );
    expect(tableSource).toMatch(
      /add\.isEnabled && add\.placement !== HEADER_PLACEMENT/,
    );
    expect(tableSource).toContain(':can-add-row="canAddFromToolbar"');
    expect(tableSource).not.toContain("button.hidden");
  });
});
