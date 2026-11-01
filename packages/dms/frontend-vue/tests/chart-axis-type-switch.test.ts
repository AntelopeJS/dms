/** @vitest-environment jsdom */
/**
 * Apex merges an update into the options it holds, so a chart switching from
 * calendar buckets (a category axis with its own formatters) to a datetime
 * axis kept the bucket formatter and wrote raw timestamps, and the reverse
 * wrote indexes. The host draws such a chart anew instead of updating it.
 */
import { createApp, h, nextTick, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ApexChartHost from "../layers/dms-ui/app/components/chart/ApexChartHost.vue";
import { installApexDom } from "./helpers/chart-extra-runtime";

const formatter = (value: string) => `Bucket ${value}`;
const BUCKETED = {
  xaxis: { type: "category", labels: { formatter } },
  tooltip: { x: { formatter } },
};
const DATETIME = {
  xaxis: { type: "datetime", labels: { format: "HH:mm" } },
  tooltip: {},
};

let app: ReturnType<typeof createApp> | undefined;
type HostOptions = InstanceType<typeof ApexChartHost>["$props"]["options"];
const options = ref<HostOptions>({});

async function mountHost(initial: HostOptions): Promise<HTMLElement> {
  options.value = { chart: { animations: { enabled: false } }, ...initial };
  const root = document.createElement("div");
  document.body.append(root);
  app = createApp(() =>
    h(ApexChartHost, {
      apexType: "bar",
      height: 300,
      options: options.value,
      series: [
        {
          name: "Revenue",
          data: [
            { x: 1728000000000, y: 2 },
            { x: 1728086400000, y: 4 },
          ],
        },
      ],
    }),
  );
  app.mount(root);
  await vi.waitFor(() => {
    expect(root.querySelector("svg.apexcharts-svg")).not.toBeNull();
  });
  return root;
}

beforeEach(() => {
  installApexDom();
  vi.stubGlobal("useI18n", () => ({ locale: ref("en") }));
});

afterEach(() => {
  app?.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("draws a bucketed chart anew when its axis turns datetime", async () => {
  const root = await mountHost(BUCKETED);
  const before = root.querySelector(".vue-apexcharts");
  expect(root.textContent).toContain("Bucket");

  options.value = DATETIME;
  await nextTick();
  await nextTick();

  await vi.waitFor(() =>
    expect(root.querySelector(".vue-apexcharts")).not.toBe(before),
  );
  expect(root.querySelector("svg.apexcharts-svg")).not.toBeNull();
  expect(root.querySelector(".apexcharts-xaxis")?.textContent).not.toContain(
    "Bucket",
  );
});

it("draws a datetime chart anew when its axis turns to buckets", async () => {
  const root = await mountHost(DATETIME);
  const before = root.querySelector(".vue-apexcharts");

  options.value = BUCKETED;
  await nextTick();
  await nextTick();

  await vi.waitFor(() =>
    expect(root.querySelector(".vue-apexcharts")).not.toBe(before),
  );
  expect(root.querySelector("svg.apexcharts-svg")).not.toBeNull();
  expect(root.querySelector(".apexcharts-xaxis")?.textContent).toContain(
    "Bucket",
  );
});

it("updates a chart in place while its axis keeps its type", async () => {
  const root = await mountHost(DATETIME);
  const before = root.querySelector(".vue-apexcharts");

  options.value = {
    ...DATETIME,
    xaxis: { type: "datetime", labels: { format: "dd MMM" } },
  };
  await nextTick();

  expect(root.querySelector(".vue-apexcharts")).toBe(before);
  await vi.waitFor(() =>
    expect(root.querySelector(".apexcharts-xaxis")?.textContent).toContain(
      "Oct",
    ),
  );
});
