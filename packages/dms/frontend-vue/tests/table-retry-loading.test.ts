/**
 * The renderer keeps a failed list's `error` while the next run is in flight,
 * as Nuxt does. A table retrying its list (its retry button, a filter, a page)
 * shows that run, its skeleton or the rows it has, rather than the error panel
 * of the answer it may replace: the failure the table reads is the settled
 * one.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tableView = readFileSync(
  resolve(__dirname, "../layers/dms-ui/app/components/table-view/TableView.vue"),
  "utf8",
);

describe("a table retrying its list after a failure", () => {
  it("reads the failure of settled runs only", () => {
    expect(tableView).toMatch(
      /const settledError = computed\(\(\) =>\s*status\.value === "pending" \? null : error\.value,?\s*\);/,
    );
  });

  it("draws its skeleton and hides its error panel while the retry runs", () => {
    const firstPage = tableView.slice(
      tableView.indexOf("const isFirstPageLoading"),
    );
    expect(firstPage.slice(0, firstPage.indexOf(";"))).toMatch(
      /!settledError\.value/,
    );
    const panel = tableView.slice(tableView.indexOf("const listLoadError"));
    expect(panel.slice(0, panel.indexOf("});"))).toMatch(
      /const failure = settledError\.value;\s*if \(!failure\) return undefined;/,
    );
    expect(panel.slice(0, panel.indexOf("});"))).not.toMatch(/error\.value/);
  });
});
