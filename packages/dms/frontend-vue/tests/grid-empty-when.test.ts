/**
 * A Grid with `emptyWhen` reads a route and, when the value it names is
 * empty, draws one EmptyState across the grid instead of its rows; it keeps
 * its rows while the route loads, after it fails, and once the value is set.
 */
import {
  computed,
  createSSRApp,
  defineComponent,
  h,
  inject,
  provide,
  ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Grid from "../layers/dms-ui/app/components/grid/Grid.vue";
import {
  isEmptyValue,
  readFieldPath,
} from "../layers/dms-ui/app/build/composables/blocks/useEmptyWhen";

const answer = ref<Record<string, unknown> | null>(null);
const fetchOptions = vi.fn();

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: (options: unknown) => {
    fetchOptions(options);
    return { data: answer, isLoading: ref(false), error: ref(null) };
  },
}));

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({ state: ref({}) }),
}));

const Slot = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

const Button = defineComponent({
  props: { label: String, to: String },
  setup: (props) => () =>
    h("a", { "data-button": "", href: props.to }, props.label),
});

const EMPTY_WHEN = {
  fetchUrl: "/api/routes/activity?route={{query.route}}",
  periodScope: "api",
  realtimeTopic: "requests",
  field: "summary.calls",
  emptyState: {
    title: "$api.routes.statistics.idle_title",
    icon: "i-ph-moon-stars",
    actions: [{ label: "Test this route", to: "/routes?tab=2" }],
  },
};

async function render(props: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(
        Grid,
        { componentId: "statistics", pageId: "routes", ...props },
        { default: () => h("section", { "data-rows": "" }, "rows") },
      ),
  });
  for (const name of ["UIcon", "DmsLink"]) app.component(name, Slot);
  app.component("UButton", Button);
  return renderToString(app);
}

beforeEach(() => {
  answer.value = null;
  fetchOptions.mockClear();
  // Nuxt auto-imports, which Grid.vue uses unimported.
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("provide", provide);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-US"), t: String }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => (text.startsWith("$") ? `t(${text})` : text),
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("Grid emptyWhen", () => {
  it("reads the route like a block's data source", async () => {
    await render({ emptyWhen: EMPTY_WHEN });
    expect(fetchOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchUrl: EMPTY_WHEN.fetchUrl,
        periodScope: "api",
        realtimeTopic: "requests",
      }),
    );
  });

  it("requests nothing without the option, and shows its rows", async () => {
    const html = await render({});
    expect(fetchOptions).toHaveBeenCalledWith(
      expect.objectContaining({ fetchUrl: undefined }),
    );
    expect(html).toContain("data-rows");
  });

  it("keeps its rows until the route answers", async () => {
    const html = await render({ emptyWhen: EMPTY_WHEN });
    expect(html).toContain("data-rows");
    expect(html).not.toContain("idle_title");
  });

  it("keeps its rows while the value is set", async () => {
    answer.value = { summary: { calls: 12 } };
    const html = await render({ emptyWhen: EMPTY_WHEN });
    expect(html).toContain("data-rows");
    expect(html).not.toContain("idle_title");
  });

  it("swaps its rows for one empty state across the grid when the value is empty", async () => {
    answer.value = { summary: { calls: 0 } };
    const html = await render({ emptyWhen: EMPTY_WHEN });
    expect(html).not.toContain("data-rows");
    expect(html).toContain("t($api.routes.statistics.idle_title)");
    expect(html).toContain("col-[1/-1]");
    expect(html).toMatch(
      /<a data-button href="\/routes\?tab=2"[^>]*>Test this route</,
    );
  });

  it("lays the answer's own emptyState over the option's", async () => {
    answer.value = {
      summary: { calls: 0 },
      emptyState: {
        description: "Last called Oct 10",
        actions: [{ label: "Test this route", to: "/routes?route=r1&tab=2" }],
      },
    };
    const html = await render({ emptyWhen: EMPTY_WHEN });
    expect(html).toContain("t($api.routes.statistics.idle_title)");
    expect(html).toContain("Last called Oct 10");
    expect(html).toMatch(
      /<a data-button href="\/routes\?route=r1&amp;tab=2"[^>]*>/,
    );
  });
});

describe("emptyWhen field", () => {
  it("reads a dot path, stopping where it ends", () => {
    expect(readFieldPath({ a: { b: 3 } }, "a.b")).toBe(3);
    expect(readFieldPath({ a: null }, "a.b")).toBeUndefined();
    expect(readFieldPath({ calls: 0 }, "calls")).toBe(0);
  });

  it("calls absent, null, false, 0, empty text and empty lists empty", () => {
    for (const value of [undefined, null, false, 0, "", []]) {
      expect(isEmptyValue(value)).toBe(true);
    }
    for (const value of [1, true, "x", [0], {}]) {
      expect(isEmptyValue(value)).toBe(false);
    }
  });
});
