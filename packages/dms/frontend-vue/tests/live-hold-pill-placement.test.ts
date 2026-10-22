/**
 * The "N new · Show" pill of a held table lands under the column header band,
 * over the first rows, never on the header's titles: the table publishes its
 * header band's height, and the pill's overlay offsets by it, taking no room.
 */
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(
    new URL(`../layers/dms-ui/app/${path}`, import.meta.url),
    "utf8",
  );

const tableSource = read("build/components/table/Table.vue");
const tableViewSource = read("components/table-view/TableView.vue");

const pillOverlay = () => {
  const start = tableViewSource.indexOf(
    '<template v-else-if="liveHold.newCount.value > 0" #notice>',
  );
  return tableViewSource.slice(
    start,
    tableViewSource.indexOf("</template>", start),
  );
};

it("publishes the header band's height on the table root", () => {
  expect(tableSource).toContain('<thead ref="tableHead">');
  expect(tableSource).toMatch(
    /useElementSize\(tableHeadRef, undefined, \{\s*box: "border-box",\s*\}\)/,
  );
  expect(tableSource).toContain('"--dms-table-head-height":');
  expect(tableSource).toContain(
    '<div :class="uiTable.root()" :style="rootStyle">',
  );
});

it("keeps the notice right above the body, so its overlay starts at the header band", () => {
  const NOTICE_SLOT = '<slot name="notice" />';
  const notice = tableSource.indexOf(NOTICE_SLOT);
  const body = tableSource.indexOf('<slot name="body" :table="table">');
  expect(notice).toBeGreaterThan(0);
  expect(body).toBeGreaterThan(notice);
  expect(tableSource.slice(notice + NOTICE_SLOT.length, body)).not.toMatch(
    /<[a-z]/,
  );
});

it("lays the pill under the header band, taking no room", () => {
  const overlay = pillOverlay();
  expect(overlay).toContain('class="relative z-30 h-0"');
  expect(overlay).toContain(
    "absolute inset-x-0 top-[calc(var(--dms-table-head-height,0px)+0.5rem)]",
  );
  expect(overlay).toContain("pointer-events-none");
  expect(overlay).toContain('class="pointer-events-auto"');
  expect(overlay).toContain("floating");
});
