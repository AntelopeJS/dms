/**
 * A page loaded or reloaded (F5) is rendered by the server with its blocks'
 * data: a fetched block reads its route during the server render and its
 * HTML carries the answer, never a skeleton the browser would then replace
 * (the page would move as it hydrates). Holds for the blocks a client
 * navigation shows in skeleton first: list blocks, KPI cards and a fetched
 * Banner.
 */
import * as vue from "vue";
import { createSSRApp, defineComponent, h, ref, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";

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

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));
vi.mock(
  "../layers/dms-core/app/composables/components/useComponentEvent",
  () => ({ useComponentEvent: () => ({}) }),
);
vi.mock(
  "../layers/dms-ui/app/build/composables/actions/useActionTargets",
  () => ({
    useActionTargets: () => ({ handleCustomButton: () => {} }),
  }),
);

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

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});
const Skeleton = defineComponent({
  render: () => h("span", { [SKELETON_MARK]: "" }),
});

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
    shows: "4",
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

const VUE_GLOBALS = [
  "ref",
  "computed",
  "watch",
  "watchEffect",
  "onMounted",
  "onBeforeUnmount",
  "onUnmounted",
  "nextTick",
  "toRef",
  "shallowRef",
  "inject",
  "provide",
  "useSlots",
] as const;

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
  for (const name of [
    "DmsCard",
    "UCard",
    "UBadge",
    "UIcon",
    "UButton",
    "UAlert",
    "UTooltip",
    "ULink",
    "UAvatar",
    "NuxtLink",
    "DmsLink",
  ]) {
    app.component(name, Slot);
  }
  app.component("USkeleton", Skeleton);
  app.config.warnHandler = () => {};
  return renderToString(app);
}

beforeEach(() => {
  requests.length = 0;
  for (const name of VUE_GLOBALS) vi.stubGlobal(name, vue[name]);
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: async (url: string) => {
      requests.push(url);
      return ANSWERS[url] ?? null;
    },
  }));
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String, t: String }));
  vi.stubGlobal("useComponentEvent", () => ({}));
  vi.stubGlobal("useWatch", () => ({ state: ref({}) }));
  vi.stubGlobal("useDefinedFunctions", () => ({
    getFunction: () => undefined,
  }));
  vi.stubGlobal("useSiteLayout", () => ({ layout: ref(null) }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {}, params: {} }));
  useRealDataEngine();
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
