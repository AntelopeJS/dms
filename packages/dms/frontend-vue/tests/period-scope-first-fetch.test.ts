// @vitest-environment jsdom
/**
 * A period-scoped card must issue exactly one request on mount, before any
 * interaction — see AntelopeJS/dms#365. The failure mode is silent (the card
 * renders an empty value and nothing throws), so only an assertion on the
 * request count catches it, and only a run that covers both mount orders:
 * the selector registers its scope during its own setup, which may run before
 * or after the cards'.
 */
import {
  computed,
  createSSRApp,
  defineAsyncComponent,
  defineComponent,
  h,
  nextTick,
  ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PeriodState } from "../layers/dms-core/app/composables/period/types";

const requests: string[] = [];

vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    return { value: 1 };
  },
}));
vi.stubGlobal("useI18n", () => ({
  locale: ref("fr-FR"),
  t: (key: string, fallback?: string) => fallback ?? key,
}));
vi.stubGlobal("useTranslation", () => ({
  processI18n: (text: string) => text,
}));
vi.stubGlobal("useComponentEvent", () => ({}));
vi.stubGlobal("useWatch", () => ({ state: ref({}) }));

const { usePeriod } = await import(
  "../layers/dms-core/app/composables/period/usePeriod"
);
const { registerPeriodScope } = await import(
  "../layers/dms-core/app/composables/period/usePeriodScope"
);
const { useChartFetch } = await import(
  "../layers/dms-ui/app/composables/chart/useChartFetch"
);
const KpiCard = (
  await import("../layers/dms-ui/app/components/kpi/KpiCard.vue")
).default;

const SCOPE = "demo";
const GRACE_MS = 250;
// useChartFetch debounces every refresh past the first by 180ms; settle past
// that, or a duplicate first fetch lands after the assertions and goes unseen.
const SETTLE_MS = 300;

/** Same registration shape as PeriodSelector.vue: usePeriod() in setup. */
const Selector = defineComponent({
  setup() {
    const period = usePeriod({ defaultPreset: "last-7-days" });
    registerPeriodScope(SCOPE, period.state);
    return () => h("div", { class: "selector" }, period.state.value.key);
  },
});

const Card = defineComponent({
  props: {
    url: { type: String, required: true },
    scope: { type: String, default: SCOPE },
  },
  setup(props) {
    const { isLoading } = useChartFetch<{ value: number }>({
      fetchUrl: props.url,
      periodScope: props.scope || undefined,
    });
    return () => h("div", { class: "card" }, String(isLoading.value));
  },
});

const Passthrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.() ?? []),
});
const Skeleton = defineComponent({ setup: () => () => h("div", "SKELETON") });

/** Defer a component's resolution to mimic a lazily chunked global. */
function lazy(component: unknown, delayMs: number) {
  return defineAsyncComponent(
    () =>
      new Promise((resolve) =>
        setTimeout(() => resolve(component as never), delayMs),
      ),
  );
}

function page(selectorDelayMs: number, cardDelayMs: number) {
  const LazySelector = lazy(Selector, selectorDelayMs);
  const LazyCard = lazy(Card, cardDelayMs);
  return defineComponent({
    setup: () => () =>
      h("main", [
        h(LazySelector),
        h(LazyCard, { url: "/api/metrics/kpi/a" }),
        h(LazyCard, { url: "/api/metrics/kpi/b" }),
      ]),
  });
}

/**
 * Every component resolved in the same flush, the selector's setup running
 * after the cards'. This is the order measured in the running dashboard: the
 * cards register their watcher with no scope, the selector registers one, the
 * pre-flush watcher fires the first fetch, and only then does onMounted run.
 */
function sameFlushPage() {
  return defineComponent({
    setup: () => () =>
      h("main", [
        h(Card, { url: "/api/metrics/kpi/a" }),
        h(Card, { url: "/api/metrics/kpi/b" }),
        h(Selector),
      ]),
  });
}

const mounted: Array<{ unmount: () => void }> = [];

async function ssrThenHydrate(
  root: unknown,
  components: Record<string, unknown> = {},
) {
  const html = await renderToString(
    withComponents(createSSRApp(root as never), components),
  );
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  const app = withComponents(createSSRApp(root as never), components);
  app.mount(container);
  mounted.push(app);
  const deadline = Date.now() + SETTLE_MS;
  while (Date.now() < deadline) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  return { container, html };
}

function withComponents<
  A extends { component: (n: string, c: never) => unknown },
>(app: A, components: Record<string, unknown>): A {
  for (const [name, component] of Object.entries(components)) {
    app.component(name, component as never);
  }
  return app;
}

beforeEach(() => {
  requests.length = 0;
});
afterEach(() => {
  // Unmount, don't just drop the DOM: a live card keeps its watcher and its
  // debounce timer, and would fetch into the next test's request log.
  for (const app of mounted.splice(0)) app.unmount();
  document.body.innerHTML = "";
});

describe("period-scoped cards on first paint", () => {
  it.each([
    ["selector chunk first", 0, 8],
    ["card chunks first", 8, 0],
    ["same tick", 0, 0],
  ])(
    "issues exactly one request per card (%s)",
    async (_label, selectorDelay, cardDelay) => {
      await ssrThenHydrate(page(selectorDelay, cardDelay));

      expect(requests).toHaveLength(2);
      expect(new Set(requests).size).toBe(2);
      for (const url of requests) {
        expect(url).toMatch(/[?&]from=/);
        expect(url).toMatch(/[?&]to=/);
        expect(url).toMatch(/[?&]preset=last-7-days/);
      }
    },
  );

  it("does not fetch twice when the scope registers between setup and mount", async () => {
    await ssrThenHydrate(sameFlushPage());

    expect(requests).toHaveLength(2);
    expect(new Set(requests).size).toBe(2);
  });

  it("fetches a pending period after its scope disappears and returns", async () => {
    const scope = "returning-scope";
    const state = ref<PeriodState>({
      key: "initial",
      preset: "custom",
      comparison: "none",
      range: { from: new Date("2026-01-01"), to: new Date("2026-02-01") },
      compareRange: null,
    });
    const period = computed(() => state.value);
    let unregister = registerPeriodScope(scope, period);
    try {
      await ssrThenHydrate(
        defineComponent({
          setup: () => () => h(Card, { url: "/api/metrics/returning", scope }),
        }),
      );
      expect(requests).toHaveLength(1);
      state.value = {
        ...state.value,
        key: "next",
        range: { from: new Date("2026-02-01"), to: new Date("2026-03-01") },
      };
      await nextTick();
      unregister();
      await nextTick();
      unregister = registerPeriodScope(scope, period);
      await nextTick();
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      expect(requests).toHaveLength(2);
      const query = new URL(requests[1]!, "https://example.test").searchParams;
      expect(query.get("from")).toBe("2026-02-01T00:00:00.000Z");
      expect(query.get("to")).toBe("2026-03-01T00:00:00.000Z");
    } finally {
      unregister();
    }
  });

  it("shows a loading placeholder server-side rather than an empty value", async () => {
    const app = createSSRApp({
      render: () =>
        h(KpiCard as never, {
          title: "Revenue",
          componentId: "card",
          pageId: "page",
          fetchUrl: "/api/metrics/kpi/revenue",
          periodScope: SCOPE,
        }),
    });
    withComponents(app, {
      DmsCard: Passthrough,
      UIcon: Passthrough,
      USkeleton: Skeleton,
      DmsTrendBadge: Passthrough,
      DmsSparkline: Passthrough,
      ClientOnly: Passthrough,
    });

    const html = await renderToString(app);

    expect(html).toContain("SKELETON");
    expect(html).not.toContain("<span>0</span>");
  });

  it("stops loading when no selector ever registers the scope", async () => {
    const Orphan = defineComponent({
      setup: () => () =>
        h(Card, { url: "/api/metrics/kpi/orphan", scope: "never-registered" }),
    });
    const { container } = await ssrThenHydrate(Orphan);
    await new Promise((resolve) => setTimeout(resolve, GRACE_MS + 50));
    await nextTick();

    expect(requests).toHaveLength(0);
    expect(container.querySelector(".card")?.textContent).toBe("false");
  });
});
