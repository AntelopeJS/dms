// @vitest-environment jsdom
/**
 * A data block on a detail page reads the record of that page: the
 * `{{params.X}}` / `{{query.X}}` tokens of its `fetchUrl` are filled from the
 * page URL, again when it changes, and a URL with a token left unresolved is
 * never requested.
 */
import {
  type Component,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  replaceUrlVariables,
  resolveUrlVariables,
} from "../layers/dms-ui/app/build/utils/urlVariables";

const requests: string[] = [];
const route = reactive<{ query: Record<string, unknown> }>({ query: {} });

vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    return { items: [{ label: url }] };
  },
}));
vi.stubGlobal("useDmsRoute", () => route);

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));
vi.mock(
  "../layers/dms-core/app/composables/components/useComponentEvent",
  () => ({ useComponentEvent: () => ({}) }),
);

const { useChartFetch } = await import(
  "../layers/dms-ui/app/composables/chart/useChartFetch"
);
const { useBlockItems } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useBlockItems"
);

// useChartFetch debounces every refresh past the first by 180ms.
const SETTLE_MS = 250;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

const mounted: Array<{ unmount: () => void }> = [];

function mount(component: Component) {
  const app = createApp(component);
  app.mount(document.createElement("div"));
  mounted.push(app);
}

beforeEach(() => {
  requests.length = 0;
  route.query = {};
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

describe("resolveUrlVariables", () => {
  it("fills route parameters and query values", () => {
    expect(
      resolveUrlVariables("/api/ws/{{params.id}}/facts?tab={{query.tab}}", {
        routeParams: { id: "ws-1" },
        routeQuery: { tab: "billing" },
      }),
    ).toBe("/api/ws/ws-1/facts?tab=billing");
  });

  it("reaches one occurrence of a repeated parameter", () => {
    expect(
      resolveUrlVariables("/api/ws/{{params.id:1}}/rows/{{params.id}}", {
        routeParams: { id: "row-7", "id:1": "ws-1", "id:2": "row-7" },
        routeQuery: {},
      }),
    ).toBe("/api/ws/ws-1/rows/row-7");
  });

  it("gives nothing while a token has no value", () => {
    const context = { routeParams: {}, routeQuery: {} };
    expect(resolveUrlVariables("/api/ws/{{params.id}}", context)).toBe(
      undefined,
    );
    expect(replaceUrlVariables("/api/ws/{{params.id}}", context)).toBe(
      "/api/ws/{{params.id}}",
    );
  });

  it("leaves a URL without tokens as it is", () => {
    expect(resolveUrlVariables("/api/plain", { routeQuery: {} })).toBe(
      "/api/plain",
    );
  });
});

describe("useChartFetch with a templated fetchUrl", () => {
  function mountFetch(
    fetchUrl: string,
    routeParams: () => Record<string, string> | undefined,
  ) {
    const state: { isLoading?: { value: boolean } } = {};
    const Probe = defineComponent({
      setup() {
        const { isLoading } = useChartFetch<unknown>({ fetchUrl, routeParams });
        state.isLoading = isLoading;
        return () => h("div");
      },
    });
    mount(Probe);
    return state;
  }

  it("requests the URL of the page's record", async () => {
    mountFetch("/api/ws/{{params.id}}/facts", () => ({ id: "ws-1" }));
    await settle();
    expect(requests).toEqual(["/api/ws/ws-1/facts"]);
  });

  it("requests nothing, and shows no skeleton, while a token is unresolved", async () => {
    const state = mountFetch("/api/ws/{{params.id}}/facts", () => ({}));
    await settle();
    expect(requests).toEqual([]);
    expect(state.isLoading?.value).toBe(false);
  });

  it("follows the route to another record", async () => {
    const params = ref<Record<string, string>>({ id: "ws-1" });
    mountFetch("/api/ws/{{params.id}}/facts", () => params.value);
    await settle();
    params.value = { id: "ws-2" };
    await nextTick();
    await settle();
    expect(requests).toEqual(["/api/ws/ws-1/facts", "/api/ws/ws-2/facts"]);
  });

  it("fetches once a query value it waited for appears", async () => {
    mountFetch("/api/activity?actor={{query.actor}}", () => ({}));
    await settle();
    expect(requests).toEqual([]);
    route.query = { actor: "u-1" };
    await nextTick();
    await settle();
    expect(requests).toEqual(["/api/activity?actor=u-1"]);
  });
});

describe("useBlockItems with a templated fetchUrl", () => {
  function mountItems(routeParams: Record<string, string>) {
    const state: { items?: { value: unknown[] } } = {};
    const Probe = defineComponent({
      setup() {
        const { items } = useBlockItems<{ label: string }>({
          items: () => [{ label: "static" }],
          fetchUrl: "/api/ws/{{params.id}}/billing-info",
          routeParams: () => routeParams,
        });
        state.items = items;
        return () => h("div");
      },
    });
    mount(Probe);
    return state;
  }

  it("lists the items of the page's record", async () => {
    const state = mountItems({ id: "ws-1" });
    await settle();
    expect(requests).toEqual(["/api/ws/ws-1/billing-info"]);
    expect(state.items?.value).toEqual([
      { label: "/api/ws/ws-1/billing-info" },
    ]);
  });

  it("shows its empty state, not the static items, without the record", async () => {
    const state = mountItems({});
    await settle();
    expect(requests).toEqual([]);
    expect(state.items?.value).toEqual([]);
  });
});
