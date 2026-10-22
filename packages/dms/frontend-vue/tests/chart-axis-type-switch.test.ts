// @vitest-environment jsdom
/**
 * Apex merges an update into the options it holds, so a chart switching from
 * calendar buckets (a category axis with its own formatters) to a datetime
 * axis kept the bucket formatter and wrote raw timestamps, and the reverse
 * wrote indexes. The host draws such a chart anew instead of updating it.
 */
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ApexChartHost from "../layers/dms-ui/app/components/chart/ApexChartHost.vue";

const mountedWith: Record<string, unknown>[] = [];
const updateOptions = vi.fn(async () => undefined);

vi.mock("apexcharts", () => ({ default: {} }));
vi.mock("../layers/dms-ui/app/composables/chart/apexLocales", () => ({
  ensureApexLocale: async () => undefined,
}));
vi.mock("vue3-apexcharts", () => ({
  default: defineComponent({
    props: { options: { type: Object, default: () => ({}) } },
    setup(props, { expose }) {
      mountedWith.push(props.options);
      expose({
        chart: { windowResizeHandler: () => undefined },
        updateOptions,
      });
      return () => h("div", { class: "apex-stub" });
    },
  }),
}));

const formatter = (value: string) => value;
const BUCKETED = {
  xaxis: { type: "category", labels: { formatter } },
  tooltip: { x: { formatter } },
};
const DATETIME = {
  xaxis: { type: "datetime", labels: { format: "HH:mm" } },
  tooltip: {},
};

let app: ReturnType<typeof createApp> | undefined;
const options = ref<Record<string, unknown>>({});

async function mountHost(initial: Record<string, unknown>): Promise<void> {
  options.value = initial;
  const root = document.createElement("div");
  app = createApp(() =>
    h(ApexChartHost, {
      apexType: "bar",
      height: 300,
      options: options.value,
      series: [],
    }),
  );
  app.mount(root);
  await vi.waitFor(() => {
    expect(root.querySelector(".apex-stub")).not.toBeNull();
  });
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ locale: ref("en") }));
});

afterEach(() => {
  app?.unmount();
  mountedWith.length = 0;
  updateOptions.mockClear();
  vi.unstubAllGlobals();
});

it("draws a bucketed chart anew when its axis turns datetime", async () => {
  await mountHost(BUCKETED);

  options.value = DATETIME;
  await nextTick();
  await nextTick();

  expect(updateOptions).not.toHaveBeenCalled();
  expect(mountedWith).toHaveLength(2);
  const xaxis = mountedWith[1]!.xaxis as Record<string, unknown>;
  expect(xaxis.type).toBe("datetime");
  expect(xaxis.labels).not.toHaveProperty("formatter");
});

it("draws a datetime chart anew when its axis turns to buckets", async () => {
  await mountHost(DATETIME);

  options.value = BUCKETED;
  await nextTick();
  await nextTick();

  expect(updateOptions).not.toHaveBeenCalled();
  expect(mountedWith).toHaveLength(2);
  const xaxis = mountedWith[1]!.xaxis as Record<string, unknown>;
  expect(xaxis.type).toBe("category");
  expect(xaxis.labels).not.toHaveProperty("format");
});

it("updates a chart in place while its axis keeps its type", async () => {
  await mountHost(DATETIME);

  options.value = {
    ...DATETIME,
    xaxis: { type: "datetime", labels: { format: "dd MMM" } },
  };
  await nextTick();

  expect(updateOptions).toHaveBeenCalledOnce();
  expect(mountedWith).toHaveLength(1);
});
