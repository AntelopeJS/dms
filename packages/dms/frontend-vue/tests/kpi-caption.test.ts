/** @vitest-environment jsdom */
import { createSSRApp, h, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KpiCard from "../layers/dms-ui/app/components/kpi/KpiCard.vue";
import {
  extraRuntime,
  provideExtraRuntime,
  registerTextBoundaries,
} from "./helpers/chart-extra-runtime";

type CardResponse =
  import("../layers/dms-ui/app/composables/chart/types").KpiCardResponse;
const response = ref<CardResponse | null>(null);
const DESCRIPTION = "Requests you allowed when asked";
const CAPTION = "4 / 8 · 50%";

async function render(
  props: Partial<InstanceType<typeof KpiCard>["$props"]> = {},
) {
  const app = createSSRApp({
    render: () =>
      h(KpiCard, {
        title: "Approvals",
        componentId: "kpi",
        pageId: "page",
        description: DESCRIPTION,
        fetchUrl: "/approvals",
        ...props,
      }),
  });
  provideExtraRuntime(app, true);
  registerTextBoundaries(app);
  return renderToString(app);
}

beforeEach(async () => {
  await extraRuntime(async () => response.value);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en-GB"), t: String }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a KPI card whose data carries a caption", () => {
  it("shows the caption in place of the description", async () => {
    response.value = { value: 4, caption: CAPTION };
    const html = await render();
    expect(html).toContain(CAPTION);
    expect(html).not.toContain(DESCRIPTION);
  });

  it("shows the description when the data has no caption", async () => {
    response.value = { value: 4 };
    const html = await render();
    expect(html).toContain(DESCRIPTION);
  });

  it("shows the description when the caption is empty", async () => {
    response.value = { value: 4, caption: "" };
    const html = await render();
    expect(html).toContain(DESCRIPTION);
  });

  it("shows the caption over the comparison label while comparing", async () => {
    response.value = {
      value: 4,
      delta: 10,
      previousValue: 3,
      caption: CAPTION,
    };
    const html = await render({ compareLabel: "vs previous month" });
    expect(html).toContain(CAPTION);
    expect(html).not.toContain("vs previous month");
  });
});
