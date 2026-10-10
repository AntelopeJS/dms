import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tableSource = readFileSync(
  resolve(__dirname, "../layers/dms-ui/app/build/components/table/Table.vue"),
  "utf8",
);

describe("table empty body", () => {
  it("centres on the visible part of a table wider than its card", () => {
    expect(tableSource).toMatch(
      /emptyBody:\s*"sticky start-0 w-\[var\(--dms-table-viewport,auto\)\]"/,
    );
    expect(tableSource).toMatch(
      /<div :class="uiTable\.emptyBody\(\)">\s*<TableEmpty/,
    );
  });

  it("knows the visible width of every table, not only expandable ones", () => {
    expect(tableSource).toMatch(
      /"--dms-table-viewport":\s*tableViewportWidth\.value > 0/,
    );
  });
});
