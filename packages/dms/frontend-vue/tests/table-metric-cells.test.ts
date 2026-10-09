// @vitest-environment jsdom
import { createApp, defineComponent, h, type App, type VNodeChild } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import {
  formatBytes,
  formatDuration,
  progressShares,
  registerMetricCellTypes,
} from "../layers/dms-ui/app/build/composables/data-types/metricCells";

vi.mock("../layers/dms-ui/app/build/components/table/MonoCell.vue", () => ({
  default: {
    props: ["value", "copy"],
    render(this: { value: string; copy: boolean }) {
      return h("code", { "data-copy": String(this.copy) }, this.value);
    },
  },
}));

type Formatter = (
  value: unknown,
  locale: string,
  options?: unknown,
  row?: Record<string, unknown>,
) => VNodeChild;

const formatters = new Map<string, Formatter>();
registerMetricCellTypes((dataType: DataType) => {
  formatters.set(dataType.id, dataType.formatter!.default as Formatter);
});

describe("metric cell formats", () => {
  it("reads a duration in its most fitting unit", () => {
    expect(formatDuration(910, "en-GB")).toBe("910 ms");
    expect(formatDuration(1800, "en-GB")).toBe("1.8 s");
    expect(formatDuration(1800, "fr-FR")).toBe("1,8 s");
    expect(formatDuration(252_000, "en-GB")).toBe("4 min 12 s");
    expect(formatDuration(240_000, "en-GB")).toBe("4 min");
    expect(formatDuration(7_500_000, "en-GB")).toBe("2 h 5 min");
  });

  it("reads a size in its most fitting unit", () => {
    expect(formatBytes(512, "en-GB")).toBe("512 B");
    expect(formatBytes(12_400, "en-GB")).toBe("12.4 kB");
    expect(formatBytes(1_400_000, "en-GB")).toBe("1.4 MB");
  });

  it("fills the bar with the items done, the failed ones at its end", () => {
    expect(progressShares(31, 0, 44)).toEqual({
      done: (31 / 44) * 100,
      failed: 0,
    });
    expect(progressShares(39, 2, 41).failed).toBeCloseTo((2 / 41) * 100);
    expect(progressShares(5, 0, 0)).toEqual({ done: 0, failed: 0 });
  });
});

describe("metric cells", () => {
  let app: App | undefined;

  const render = (content: VNodeChild): HTMLElement => {
    const container = document.createElement("div");
    app = createApp(defineComponent({ setup: () => () => content }));
    app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
    app.mount(container);
    return container;
  };

  beforeEach(() => {
    vi.stubGlobal("useTranslation", () => ({
      processI18n: (text: string) => text.replace(/^\$/, "i18n:"),
    }));
    vi.stubGlobal("useI18n", () => ({
      t: (key: string) => `i18n:${key}`,
      locale: { value: "en-GB" },
    }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("names a status pill after the select item, in the tone its value maps to, the cause under it", () => {
    const cell = render(
      formatters.get("status_pill")!(
        "failing",
        "en-GB",
        {
          tones: { failing: "error" },
          subField: "lastError",
          typeOptions: {
            items: [{ value: "failing", label: "$automation.failing" }],
          },
        },
        { lastError: "HTTP 502 at Push invoice" },
      ),
    );
    expect(cell.textContent).toContain("i18n:automation.failing");
    expect(cell.textContent).toContain("HTTP 502 at Push invoice");
    expect(cell.innerHTML).toContain("text-error");
  });

  it("draws a progress bar with its figures", () => {
    const cell = render(
      formatters.get("progress")!(
        undefined,
        "en-GB",
        {
          doneField: "done",
          totalField: "total",
          errorField: "failed",
        },
        { done: 18, total: 20, failed: 2 },
      ),
    );
    expect(cell.textContent).toBe("18 / 20");
    expect(
      cell.querySelector('[role="progressbar"]')?.getAttribute("aria-valuemax"),
    ).toBe("20");
  });

  it("draws a duration and a size as right-aligned figures, a stored second as one", () => {
    expect(
      render(formatters.get("duration")!(1.8, "en-GB", { unit: "s" }))
        .textContent,
    ).toBe("1.8 s");
    app?.unmount();
    expect(render(formatters.get("bytes")!(2048, "en-GB")).textContent).toBe(
      "2 kB",
    );
  });

  it("hands a mono value its copy button", () => {
    const cell = render(
      formatters.get("mono")!("run_8f3a2c", "en-GB", { copy: true }),
    );
    expect(cell.querySelector("code")?.getAttribute("data-copy")).toBe("true");
    expect(cell.textContent).toBe("run_8f3a2c");
  });
});
