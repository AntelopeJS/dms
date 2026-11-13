/**
 * A page loaded or reloaded (F5) is rendered by the server with its blocks'
 * data: a fetched block reads its route during the server render and its
 * HTML carries the answer, never a skeleton the browser would then replace
 * (the page would move as it hydrates). Holds for the blocks a client
 * navigation shows in skeleton first: list blocks, KPI cards and a fetched
 * Banner.
 */
import { createSSRApp, h, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installBlockNetwork,
  provideBlockRuntime,
  registerBlockUi,
} from "./helpers/block-network-runtime";

const SHOWN = "Pending orders";
const ANSWERS: Record<string, unknown> = {
  "/api/orders/kpi": { value: 4321 },
  "/api/orders/facts": { items: [{ label: SHOWN, value: "12" }] },
  "/api/orders/cards": {
    items: [{ title: SHOWN, icon: "i-ph-package", to: "/orders" }],
  },
  "/api/orders/banner": { title: SHOWN },
};
const requests: string[] = [];

const { default: KpiCard } = await import(
  "../layers/dms-ui/app/components/kpi/KpiCard.vue"
);
const { default: KeyValueListBlock } = await import(
  "../layers/dms-ui/app/components/blocks/KeyValueListBlock.vue"
);
const { default: NavCardGridBlock } = await import(
  "../layers/dms-ui/app/components/blocks/NavCardGridBlock.vue"
);
const { default: BannerBlock } = await import(
  "../layers/dms-ui/app/components/blocks/BannerBlock.vue"
);

const SKELETON_MARK = "data-test-skeleton";

interface BlockCase {
  name: string;
  component: Component;
  fetchUrl: string;
  shows: string;
}

const BLOCKS: BlockCase[] = [
  {
    name: "KpiCard",
    component: KpiCard,
    fetchUrl: "/api/orders/kpi",
    shows: ">4.3</span>",
  },
  {
    name: "KeyValueList",
    component: KeyValueListBlock,
    fetchUrl: "/api/orders/facts",
    shows: SHOWN,
  },
  {
    name: "NavCardGrid",
    component: NavCardGridBlock,
    fetchUrl: "/api/orders/cards",
    shows: SHOWN,
  },
  {
    name: "Banner",
    component: BannerBlock,
    fetchUrl: "/api/orders/banner",
    shows: SHOWN,
  },
];

async function renderOnServer(block: BlockCase): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(block.component, {
        componentId: "block",
        pageId: "orders",
        title: "Orders",
        fetchUrl: block.fetchUrl,
      }),
  });
  await provideBlockRuntime(app, true);
  registerBlockUi(app);
  return renderToString(app);
}

beforeEach(async () => {
  requests.length = 0;
  await installBlockNetwork(async (url: string) => {
    requests.push(url);
    return ANSWERS[url] ?? null;
  });
});

afterEach(() => vi.unstubAllGlobals());

describe.each(BLOCKS)("$name on a page loaded from the server", (block) => {
  it("renders its data, not a skeleton", async () => {
    const html = await renderOnServer(block);
    expect(requests).toEqual([block.fetchUrl]);
    expect(html).not.toContain(SKELETON_MARK);
    expect(html).toContain(block.shows);
  });
});
