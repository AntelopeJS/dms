// @vitest-environment jsdom
import { createApp, defineComponent, h, type App, type VNodeChild } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { formatDuration } from "../layers/dms-core/app/utils/formatter";
import Button from "@nuxt/ui/components/Button.vue";
import { Color } from "../layers/dms-core/app/types/color";

const ROUNDED = { precision: "rounded" } as const;
import {
  formatBytes,
  progressShares,
  registerMetricCellTypes,
} from "../layers/dms-ui/app/build/composables/data-types/metricCells";

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
    expect(formatDuration(910, "en-GB", ROUNDED)).toBe("910 ms");
    expect(formatDuration(1800, "en-GB", ROUNDED)).toBe("1.8 s");
    expect(formatDuration(1800, "fr-FR", ROUNDED)).toBe("1,8 s");
    expect(formatDuration(252_000, "en-GB", ROUNDED)).toBe("4 min 12 s");
    expect(formatDuration(240_000, "en-GB", ROUNDED)).toBe("4 min");
    expect(formatDuration(7_500_000, "en-GB", ROUNDED)).toBe("2 h 5 min");
    expect(formatDuration(2149, "en-GB", ROUNDED)).toBe("2.1 s");
    expect(formatDuration(252_600, "en-GB", ROUNDED)).toBe("4 min 13 s");
    // Rounded as a whole: never "1 min 60 s".
    expect(formatDuration(119_700, "en-GB", ROUNDED)).toBe("2 min");
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
  const copiedValues: string[] = [];
  const toast = vi.fn();

  const render = (content: VNodeChild): HTMLElement => {
    const container = document.createElement("div");
    app = createApp(defineComponent({ setup: () => () => content }));
    app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
    app.component("UButton", Button);
    app.mount(container);
    return container;
  };

  beforeEach(() => {
    copiedValues.length = 0;
    toast.mockClear();
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: () => {
        copiedValues.push(document.querySelector("textarea")!.value);
        return true;
      },
    });
    vi.stubGlobal("Color", Color);
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useToast", () => ({ add: toast }));
    // The formatters read the application's composer, not `useI18n()`.
    vi.stubGlobal("useDmsApp", () => ({
      $i18n: { t: (key: string) => `i18n:${key}`, locale: { value: "en-GB" } },
    }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    Reflect.deleteProperty(document, "execCommand");
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

  it("tones a status pill by the row's tone field before the column's map", () => {
    const options = { tones: { "404": "info" }, toneField: "statusTone" };
    const pill = (row: Record<string, unknown>) =>
      render(formatters.get("status_pill")!(404, "en-GB", options, row))
        .innerHTML;

    expect(pill({ statusTone: "warning" })).toContain("text-warning");
    app?.unmount();
    expect(pill({ statusTone: "not-a-tone" })).toContain("text-info");
    app?.unmount();
    expect(
      render(
        formatters.get("status_pill")!(
          503,
          "en-GB",
          { toneField: "statusTone" },
          { statusTone: "error" },
        ),
      ).innerHTML,
    ).toContain("text-error");
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

  it("hands a mono value its copy button", async () => {
    const cell = render(
      formatters.get("mono")!("run_8f3a2c", "en-GB", { copy: true }),
    );
    cell
      .querySelector<HTMLButtonElement>('[aria-label="dms.table.cell.copy"]')!
      .click();
    await vi.waitFor(() => expect(copiedValues).toEqual(["run_8f3a2c"]));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "success",
        title: "dms.table.cell.copied",
      }),
    );
    expect(cell.textContent).toBe("run_8f3a2c");
  });
});
