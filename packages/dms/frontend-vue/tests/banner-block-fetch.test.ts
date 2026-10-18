// @vitest-environment jsdom
/**
 * A Banner with a `fetchUrl` draws what its route answers, over its static
 * options field by field; holds the page (its Suspense) until the first
 * answer, so it never appears late; draws nothing when the route answers no
 * banner (`null`, `{}`, a 204); reads its route again on a page refresh; and
 * runs the button targets the route answers.
 */
import { Suspense, createApp, defineComponent, h, reactive, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";

const requests: string[] = [];
let answer: unknown = null;
// When set, the route answers only once it resolves.
let gate: Promise<void> | null = null;
const pressed: unknown[] = [];

vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    if (gate) await gate;
    return answer;
  },
}));
vi.stubGlobal("useDmsRoute", () => reactive({ query: {} }));
vi.stubGlobal("useDmsCookie", () => ref<string[]>([]));
vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
vi.stubGlobal("useApiError", () => {});
vi.stubGlobal("useI18n", () => ({ t: String, locale: ref("en") }));

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));
vi.mock(
  "../layers/dms-ui/app/build/composables/actions/useActionTargets",
  () => ({
    useActionTargets: () => ({
      handleCustomButton: (button: unknown) => pressed.push(button),
    }),
  }),
);
vi.mock("../layers/dms-ui/app/components/banner/Banner.vue", () => ({
  default: defineComponent({
    props: {
      title: { type: String, default: undefined },
      description: { type: String, default: undefined },
      tone: { type: String, default: undefined },
      icon: { type: String, default: undefined },
    },
    setup:
      (props, { slots }) =>
      () =>
        h("section", { "data-banner": JSON.stringify(props) }, [
          slots.actions?.(),
        ]),
  }),
}));

const { default: BannerBlock } = await import(
  "../layers/dms-ui/app/components/blocks/BannerBlock.vue"
);

// useChartFetch debounces every refresh past the first by 180ms.
const SETTLE_MS = 250;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
const FETCH_URL = "/api/ws/{{params.id}}/health";

const UButton = defineComponent({
  props: { label: { type: String, default: undefined } },
  setup:
    (props, { attrs }) =>
    () =>
      h("button", { onClick: attrs.onClick }, props.label),
});

const mounted: Array<{ unmount: () => void }> = [];

// The page renders its blocks under a Suspense, which a banner holds until
// its first answer.
function mountBanner(props: Record<string, unknown>, onResolve = () => {}) {
  const root = document.createElement("div");
  const app = createApp(() =>
    h(
      Suspense,
      { onResolve },
      {
        default: () =>
          h(BannerBlock, {
            componentId: "health",
            pageId: "ws",
            routeParams: { id: "ws-1" },
            fetchUrl: FETCH_URL,
            ...props,
          }),
      },
    ),
  );
  app.component("UButton", UButton);
  app.mount(root);
  mounted.push(app);
  return {
    root,
    read: () => {
      const banner = root.querySelector("[data-banner]");
      return banner ? JSON.parse(banner.getAttribute("data-banner")!) : null;
    },
  };
}

beforeEach(() => useRealDataEngine());

beforeEach(() => {
  requests.length = 0;
  pressed.length = 0;
  answer = null;
  gate = null;
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

it("draws the fetched props over the static options", async () => {
  answer = { tone: "error", title: "Provider down" };
  const banner = mountBanner({ title: "Static", description: "Kept" });
  expect(banner.read()).toBeNull();
  await settle();

  expect(requests).toEqual(["/api/ws/ws-1/health"]);
  expect(banner.read()).toMatchObject({
    tone: "error",
    title: "Provider down",
    description: "Kept",
    icon: "i-ph-warning-circle",
  });
});

it("holds the page until its route answers, then shows with it", async () => {
  let open = () => {};
  gate = new Promise<void>((resolve) => (open = resolve));
  answer = { tone: "warning", title: "Degraded" };
  let resolved = false;
  const banner = mountBanner({}, () => (resolved = true));
  await settle();
  expect(requests).toEqual(["/api/ws/ws-1/health"]);
  expect(resolved).toBe(false);

  open();
  await settle();
  expect(resolved).toBe(true);
  expect(banner.read()).toMatchObject({ title: "Degraded" });
});

it("does not hold the page while its URL waits for a value", async () => {
  let resolved = false;
  mountBanner({ routeParams: {} }, () => (resolved = true));
  await settle();
  expect(requests).toEqual([]);
  expect(resolved).toBe(true);
});

it.each([
  ["null", null],
  ["an empty object", {}],
  ["no content (204)", undefined],
])("draws nothing when the route answers %s", async (_name, response) => {
  answer = response;
  const banner = mountBanner({ title: "Static" });
  await settle();
  expect(requests).toHaveLength(1);
  expect(banner.root.innerHTML).toBe("<!--v-if-->");
});

it("follows a page refresh, appearing and going away", async () => {
  const banner = mountBanner({});
  await settle();
  expect(banner.read()).toBeNull();

  answer = { title: "Degraded" };
  refreshPageBlocks();
  await settle();
  expect(banner.read()).toMatchObject({ title: "Degraded" });

  answer = null;
  refreshPageBlocks();
  await settle();
  expect(banner.read()).toBeNull();
  expect(requests).toHaveLength(3);
});

it("runs a button target the route answers", async () => {
  const replay = {
    label: "Replay",
    target: { type: "api", url: "/api/replay", successMessage: "Replayed" },
    confirm: { title: "Replay the queue?" },
  };
  answer = { title: "Outage", actions: [replay] };
  const banner = mountBanner({});
  await settle();

  banner.root.querySelector("button")!.click();
  expect(pressed).toEqual([replay]);
});
