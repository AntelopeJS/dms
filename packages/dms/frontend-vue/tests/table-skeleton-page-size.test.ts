/**
 * A table view's first-load placeholder is a full page: as many skeleton rows
 * (or cards) as the page will list, up to the largest page size, so the
 * pagination footer under them already stands where the loaded page puts it
 * and does not move when the rows land.
 */
import { computed, createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardGridSkeleton from "../layers/dms-ui/app/build/components/table-view/CardGridSkeleton.vue";
import { MAX_PAGE_SIZE } from "../layers/dms-ui/app/build/composables/table/constants";

const Skeleton = defineComponent({
  setup: () => () => h("i", { "data-skeleton": "" }),
});

function renderGrid(count: number, minWidth?: string): Promise<string> {
  const app = createSSRApp({
    render: () => h(CardGridSkeleton, { count, fields: 2, minWidth }),
  });
  app.component("USkeleton", Skeleton);
  return renderToString(app);
}

async function renderCards(count: number): Promise<number> {
  const html = await renderGrid(count);
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

  it("sizes its full page of cards with the table's card.minWidth", async () => {
    const html = await renderGrid(24, "18rem");
    expect(html).toContain("--dms-card-min-width:18rem");
    expect(html).toContain("calc(24 * ");
  });
});
