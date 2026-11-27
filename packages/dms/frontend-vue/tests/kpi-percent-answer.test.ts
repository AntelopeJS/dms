// @vitest-environment jsdom
import { createSSRApp, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KpiCard from "../layers/dms-ui/app/components/kpi/KpiCard.vue";
import {
  extraRuntime,
  provideExtraRuntime,
  registerTextBoundaries,
} from "./helpers/chart-extra-runtime";

type CardResponse =
  import("../layers/dms-ui/app/composables/chart/types").KpiCardResponse;
const response = ref<CardResponse | null>(null);

const VALUE_TEXT = /<p class="text-highlighted[^>]*>.*?<span>([^<]*)<\/span>/;

async function render() {
  const app = createSSRApp({
    render: () =>
      h(KpiCard, {
        title: "Utilisation",
        componentId: "kpi",
        pageId: "page",
        fetchUrl: "/utilisation",
        valueFormat: "percent",
      }),
  });
  provideExtraRuntime(app, true);
  registerTextBoundaries(app);
  return renderToString(app);
}

async function figureShown(): Promise<string | undefined> {
  return VALUE_TEXT.exec(await render())?.[1];
}

beforeEach(async () => {
  await extraRuntime(async () => response.value);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
});

describe("a KPI card with valueFormat percent over a ratio query's answer in percent units (25 for 1 of 4, where the fraction 0.25 would show as 0.3%)", () => {
  it("reads a quarter answered as 25 as 25%", async () => {
    response.value = { value: 25, previousValue: 50, delta: -50 };

    expect(await figureShown()).toBe("25%");
  });

  it("shows the change of the percentage as the relative -50, not the 25 points lost", async () => {
    response.value = { value: 25, previousValue: 50, delta: -50 };

    expect(await render()).toContain("-50.0%");
  });

  it("shows no figure, not 0%, for the answer a zero denominator leaves", async () => {
    response.value = {};

    expect(await figureShown()).toBe("—");
  });
});
