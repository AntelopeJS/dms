import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/** The room the page leaves between its blocks. */
const BLOCK_SPACING = "space-y-6";

const sourceOf = (file: string) =>
  readFileSync(new URL(`../layers/${file}`, import.meta.url), "utf8");

// A tab holding two blocks stacked them edge to edge, while the page spaces
// the same two blocks placed outside a tab.
it("spaces the blocks of a tab the way the page spaces its own", () => {
  expect(sourceOf("dms-layout/app/pages/[...slug].vue")).toContain(
    `dms-page-stack ${BLOCK_SPACING}`,
  );
  expect(sourceOf("dms-ui/app/components/tab/Tab.vue")).toMatch(
    new RegExp(
      `<div class="[^"]*\\b${BLOCK_SPACING}\\b[^"]*"[^>]*>\\s*<slot :name="item.slot" />`,
    ),
  );
});
