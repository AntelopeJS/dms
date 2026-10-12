/**
 * A Guard reads a route and, when its condition holds (the value it names is
 * empty, or the route answers 404), draws one EmptyState instead of its
 * children; it keeps them while the route loads, after any other failure,
 * and once the value is set.
 */
import { computed, createSSRApp, defineComponent, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Guard from "../layers/dms-ui/app/components/guard/Guard.vue";
import {
  isEmptyValue,
  readFieldPath,
} from "../layers/dms-ui/app/build/composables/blocks/useGuard";

const answer = ref<unknown>(null);
const failure = ref<unknown>(null);
const fetchOptions = vi.fn();

vi.mock("../layers/dms-ui/app/composables/chart/useChartFetch", () => ({
  useChartFetch: (options: unknown) => {
    fetchOptions(options);
    return { data: answer, isLoading: ref(false), error: failure };
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

const GUARD = {
  fetchUrl: "/api/routes/activity?route={{query.route}}",
  periodScope: "api",
  realtimeTopic: "requests",
  field: "summary.calls",
  fallback: {
    title: "$api.routes.statistics.idle_title",
    icon: "i-ph-moon-stars",
    actions: [{ label: "Test this route", to: "/routes?tab=2" }],
  },
};

async function render(props: Record<string, unknown>): Promise<string> {
  const app = createSSRApp({
    render: () =>
      h(
        Guard,
        { componentId: "statistics", pageId: "routes", ...props },
        { default: () => h("section", { "data-children": "" }, "children") },
      ),
  });
  for (const name of ["UIcon", "DmsLink"]) app.component(name, Slot);
  app.component("UButton", Button);
  return renderToString(app);
}

beforeEach(() => {
  answer.value = null;
  failure.value = null;
  fetchOptions.mockClear();
  // Nuxt auto-imports, which the components use unimported.
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({
    locale: ref("en-US"),
    t: (key: string) => `t(${key})`,
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => (text.startsWith("$") ? `t(${text})` : text),
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe("Guard", () => {
  it("reads the route like a block's data source", async () => {
    await render({ ...GUARD });
    expect(fetchOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        fetchUrl: GUARD.fetchUrl,
        periodScope: "api",
        realtimeTopic: "requests",
      }),
    );
  });

  it("keeps its children until the route answers", async () => {
    const html = await render({ ...GUARD });
    expect(html).toContain("data-children");
    expect(html).not.toContain("idle_title");
  });

  it("keeps its children while the value is set", async () => {
    answer.value = { summary: { calls: 12 } };
    const html = await render({ ...GUARD });
    expect(html).toContain("data-children");
    expect(html).not.toContain("idle_title");
  });

  it("keeps its children after a failure", async () => {
    answer.value = { summary: { calls: 0 } };
    failure.value = { statusCode: 500 };
    const html = await render({ ...GUARD });
    expect(html).toContain("data-children");
  });

  it("swaps its children for the fallback when the value is empty", async () => {
    answer.value = { summary: { calls: 0 } };
    const html = await render({ ...GUARD });
    expect(html).not.toContain("data-children");
    expect(html).toContain("t($api.routes.statistics.idle_title)");
    expect(html).toMatch(
      /<a data-button href="\/routes\?tab=2"[^>]*>Test this route</,
    );
  });

  it("checks the whole answer without a field", async () => {
    answer.value = [];
    const html = await render({ ...GUARD, field: undefined });
    expect(html).not.toContain("data-children");
  });

  it("lays the answer's own emptyState over the fallback", async () => {
    answer.value = {
      summary: { calls: 0 },
      emptyState: {
        description: "Last called Oct 10",
        actions: [{ label: "Test this route", to: "/routes?route=r1&tab=2" }],
      },
    };
    const html = await render({ ...GUARD });
    expect(html).toContain("t($api.routes.statistics.idle_title)");
    expect(html).toContain("Last called Oct 10");
    expect(html).toMatch(
      /<a data-button href="\/routes\?route=r1&amp;tab=2"[^>]*>/,
    );
  });

  it("falls back on a translated title without a fallback", async () => {
    answer.value = { summary: { calls: 0 } };
    const html = await render({ ...GUARD, fallback: undefined });
    expect(html).toContain("t(dms.blocks.empty)");
  });

  describe("when notFound", () => {
    const NOT_FOUND = {
      fetchUrl: "/api/routes/{{params.id}}",
      when: "notFound",
    };

    it("swaps its children for Not found when the route answers 404", async () => {
      failure.value = { statusCode: 404 };
      const html = await render(NOT_FOUND);
      expect(html).not.toContain("data-children");
      expect(html).toContain("t(dms.blocks.not_found)");
      expect(html).toContain("t(dms.blocks.not_found_hint)");
    });

    it("describes it with the 404's message, as a block does", async () => {
      failure.value = {
        statusCode: 404,
        data: { message: "No such route" },
      };
      const html = await render(NOT_FOUND);
      expect(html).toContain("t(dms.blocks.not_found)");
      expect(html).toContain("No such route");
      expect(html).not.toContain("t(dms.blocks.not_found_hint)");
    });

    it("reads the 404 body ofetch keeps on the response", async () => {
      failure.value = {
        response: {
          status: 404,
          _data: { emptyState: { title: "Workspace gone" } },
        },
      };
      expect(await render(NOT_FOUND)).toContain("Workspace gone");
    });

    it("lets the fallback replace the 404's message", async () => {
      failure.value = { statusCode: 404, data: { message: "No such route" } };
      const html = await render({
        ...NOT_FOUND,
        fallback: { description: "This route was removed." },
      });
      expect(html).toContain("This route was removed.");
      expect(html).not.toContain("No such route");
    });

    it("lays the 404 body's emptyState over the fallback", async () => {
      failure.value = {
        statusCode: 404,
        data: { emptyState: { description: "Deleted on Oct 10" } },
      };
      const html = await render({
        ...NOT_FOUND,
        fallback: { title: "Route gone" },
      });
      expect(html).toContain("Route gone");
      expect(html).toContain("Deleted on Oct 10");
    });

    it("keeps its children on an answer or another failure", async () => {
      answer.value = null;
      expect(await render(NOT_FOUND)).toContain("data-children");
      answer.value = { id: "r1" };
      expect(await render(NOT_FOUND)).toContain("data-children");
      failure.value = { statusCode: 500 };
      expect(await render(NOT_FOUND)).toContain("data-children");
    });
  });
});

describe("Guard field", () => {
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
