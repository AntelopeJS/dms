import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import type { ChartColorValue } from "@antelopejs/interface-dms/base/chart";
import { useApexChart } from "../layers/dms-ui/app/composables/chart/useApexChart";
import type { UseApexChartInput } from "../layers/dms-ui/app/composables/chart/useApexChart.types";
import {
  clearChartColorCache,
  readThemeMuted,
  resolveChartColor,
  resolveChartColors,
} from "../layers/dms-ui/app/composables/chart/useChartTheme";

const FALLBACK = "#7c3aed";
const LIGHT = "rgb(124, 58, 237)";
const DARK = "rgb(167, 139, 250)";
const TOKENS: ChartColorValue[] = [
  "primary-500",
  "accent-50",
  "neutral-950",
  "--usage",
  "var(--usage)",
];
let computedColor = LIGHT;
const probe = { style: { backgroundColor: "" } };
const appendChild = vi.fn();
const removeChild = vi.fn();

function mockBrowser() {
  vi.stubGlobal("document", {
    body: { appendChild, removeChild },
    createElement: vi.fn(() => probe),
  });
  vi.stubGlobal("getComputedStyle", () => ({ backgroundColor: computedColor }));
}

beforeEach(() => {
  computedColor = LIGHT;
  clearChartColorCache();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe("chart color tokens", () => {
  it("falls back without accessing the DOM during SSR", () => {
    expect(resolveChartColors(TOKENS)).toEqual(TOKENS.map(() => FALLBACK));
    expect(resolveChartColor(undefined)).toBe(FALLBACK);
  });

  it.each([
    ["primary", "--ui-primary"],
    ["neutral", "--ui-text-toned"],
    ["primary-500", "--ui-color-primary-500"],
    ["accent-50", "--ui-color-primary-50"],
    ["neutral-950", "--ui-color-neutral-950"],
    ["--usage", "--usage"],
    ["var(--usage)", "--usage"],
  ])("resolves %s via %s", (input, variable) => {
    mockBrowser();
    expect(resolveChartColor(input)).toBe(LIGHT);
    expect(probe.style.backgroundColor).toBe(`var(${variable}, ${FALLBACK})`);
    expect(removeChild).toHaveBeenCalledWith(probe);
  });

  it.each([
    "#abcdef",
    "rgb(1, 2, 3)",
    "hsl(0, 50%, 50%)",
    "unknown",
    "primary-123",
  ])("preserves legacy passthrough %s", (color) => {
    expect(resolveChartColor(color)).toBe(color);
  });

  it.each(["", "transparent", "rgba(0, 0, 0, 0)"])(
    "falls back for unusable computed color %s",
    (color) => {
      mockBrowser();
      computedColor = color;
      expect(resolveChartColor("--missing")).toBe(FALLBACK);
    },
  );

  it("shares cache entries across equivalent spellings", () => {
    mockBrowser();
    resolveChartColors([
      "primary-500",
      "--ui-color-primary-500",
      "var(--ui-color-primary-500)",
    ]);
    expect(appendChild).toHaveBeenCalledTimes(1);
  });

  it("does not cache SSR fallback before hydration", () => {
    expect(resolveChartColor("primary-500")).toBe(FALLBACK);
    mockBrowser();
    expect(resolveChartColor("primary-500")).toBe(LIGHT);
  });

  it("keeps text and chart fallbacks independent for the same variable", () => {
    mockBrowser();
    computedColor = "transparent";
    expect(readThemeMuted()).toBe("#6b7280");
    expect(resolveChartColor("--ui-text-muted")).toBe(FALLBACK);
  });

  it("recomputes Apex colors after theme cache invalidation and revision", () => {
    mockBrowser();
    const input = reactive<UseApexChartInput>({
      type: "line",
      series: [],
      colors: TOKENS,
      themeRevision: 0,
    });
    const chart = useApexChart(() => input);
    expect(chart.options.value.colors).toEqual(TOKENS.map(() => LIGHT));
    computedColor = DARK;
    clearChartColorCache();
    input.themeRevision = 1;
    expect(chart.options.value.colors).toEqual(TOKENS.map(() => DARK));
  });

  it("resolves series overrides and annotation colors", () => {
    mockBrowser();
    const chart = useApexChart(() => ({
      type: "line",
      series: [{ name: "usage", color: "primary-500", data: [] }],
      annotations: [{ y: 10, color: "var(--usage)" }],
    }));
    expect(chart.options.value.colors).toEqual([LIGHT]);
    expect(chart.series.value).toEqual([
      expect.objectContaining({ color: LIGHT }),
    ]);
    expect(chart.options.value.annotations).toMatchObject({
      yaxis: [expect.objectContaining({ borderColor: LIGHT })],
    });
  });

  it("refreshes mixed series colors without mutating the input", () => {
    mockBrowser();
    const input = reactive<UseApexChartInput>({
      type: "mixed",
      series: [{ name: "usage", data: [] }],
      seriesDefs: [{ name: "usage", type: "line", color: "primary-500" }],
      themeRevision: 0,
    });
    const chart = useApexChart(() => input);
    expect(chart.series.value).toEqual([
      expect.objectContaining({ color: LIGHT }),
    ]);
    computedColor = DARK;
    clearChartColorCache();
    input.themeRevision = 1;
    expect(chart.series.value).toEqual([
      expect.objectContaining({ color: DARK }),
    ]);
    expect(input.series[0]?.color).toBeUndefined();
    expect(input.seriesDefs?.[0]?.color).toBe("primary-500");
  });

  it("normalizes modern color spaces through an sRGB canvas", () => {
    mockBrowser();
    computedColor = "oklch(0.5 0.2 280)";
    const context = {
      fillStyle: "",
      fillRect: vi.fn(),
      getImageData: () => ({ data: [92, 76, 200, 255] }),
    };
    vi.mocked(document.createElement).mockReturnValueOnce(
      probe as unknown as HTMLDivElement,
    );
    vi.mocked(document.createElement).mockReturnValueOnce({
      getContext: () => context,
    } as unknown as HTMLCanvasElement);
    expect(resolveChartColor("primary-500")).toBe("rgba(92, 76, 200, 1)");
    expect(context.fillStyle).toBe(computedColor);
  });
});
