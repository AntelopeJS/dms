import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

/**
 * A hand-ordered table (`reorder`) lists its rows by position: its headers
 * offer no sort, and no sort is read back or saved for it.
 */
const tableView = readFileSync(
  resolve(
    __dirname,
    "../layers/dms-ui/app/components/table-view/TableView.vue",
  ),
  "utf8",
);
const useTable = readFileSync(
  resolve(
    __dirname,
    "../layers/dms-ui/app/build/composables/table/useTable.ts",
  ),
  "utf8",
);

it("turns sorting off on every column when the display cannot sort", () => {
  expect(tableView).toMatch(
    /return reorderConfig \? \{ \.\.\.capabilities, sorting: false \} : capabilities;/,
  );
  expect(tableView).toMatch(
    /:sorting-options="\{\s*manualSorting: true,\s*enableSorting: activeCapabilities\.sorting,\s*\}"/,
  );
  // Read again on a change of display, not only when the table is set up.
  expect(useTable).toMatch(
    /watch\(\s*\(\) => props\.tableProps\.sortingOptions\?\.enableSorting,\s*\(enableSorting\) => \{\s*table\.setOptions\(\(prev\) => \(\{ \.\.\.prev, enableSorting \}\)\);/,
  );
});

it("neither reads back nor saves a sort for a hand-ordered table", () => {
  expect(tableView).toMatch(
    /const sorting = ref<SortingState>\(\s*reorderConfig\s*\? defaultSortState\s*: sortingOrDefault\(/,
  );
  expect(tableView).toMatch(
    /\.\.\.\(reorderConfig\s*\? \[\]\s*: \[\["sorting", sorting, defaultSortState\]/,
  );
});
