/**
 * A table view's first-load placeholder is a full page: as many skeleton rows
 * (or cards) as the page will list, up to the largest page size, so the
 * pagination footer under them already stands where the loaded page puts it
 * and does not move when the rows land.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computed, createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardGridSkeleton from "../layers/dms-ui/app/build/components/table-view/CardGridSkeleton.vue";
import { MAX_PAGE_SIZE } from "../layers/dms-ui/app/build/composables/table/constants";

const Skeleton = defineComponent({
  setup: () => () => h("i", { "data-skeleton": "" }),
});

async function renderCards(count: number): Promise<number> {
  const app = createSSRApp({
    render: () => h(CardGridSkeleton, { count, fields: 2 }),
  });
  app.component("USkeleton", Skeleton);
  const html = await renderToString(app);
  return html.match(/rounded-\[10px\] border/g)?.length ?? 0;
}

beforeEach(() => {
  // Auto-imported in the application.
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({ t: String }));
});

afterEach(() => vi.unstubAllGlobals());

describe("the card grid's first-load placeholder", () => {
  it("draws the page's cards, past the dozen it used to stop at", async () => {
    expect(await renderCards(24)).toBe(24);
  });

  it("stops at the largest page size", async () => {
    expect(await renderCards(MAX_PAGE_SIZE + 10)).toBe(MAX_PAGE_SIZE);
  });
});

describe("the table's first-load placeholder", () => {
  const table = readFileSync(
    resolve(__dirname, "../layers/dms-ui/app/build/components/table/Table.vue"),
    "utf8",
  );

  it("draws as many rows as the page lists, up to the largest page size", () => {
    expect(table).toMatch(/const SKELETON_MAX_ROW_COUNT = MAX_PAGE_SIZE;/);
    expect(table).toMatch(
      /const skeletonRowCount = computed\(\(\) =>\s*Math\.min\(\s*paginationState\.value\.pageSize \|\| DEFAULT_PAGE_SIZE,\s*SKELETON_MAX_ROW_COUNT,?\s*\),?\s*\);/,
    );
  });
});
