import {
  isNumber,
  isObject,
} from "../../../../../dms-core/app/utils/type-check";
import type { ApexOptions } from "apexcharts";
import type { ChartSeries, ChartType } from "../../../composables/chart/types";
import type { UseApexChartInput } from "../../../composables/chart/useApexChart.types";
import {
  heatmapRangeColors,
  isDarkSurface,
} from "../../../composables/chart/heatmapColors";
import { readThemeSurface } from "../../../composables/chart/useChartTheme";

const VALUE_SCALED_TYPES: ChartType[] = ["heatmap"];
const VALUE_SCALED_PLOT_KEY: Partial<Record<ChartType, "heatmap">> = {
  heatmap: "heatmap",
};

function extractNumericValues(series: ChartSeries[]): number[] {
  const values: number[] = [];
  for (const entry of series) {
    for (const point of entry.data) {
      if (isNumber(point)) {
        values.push(point);
        continue;
      }
      if (point && isObject(point) && "y" in point) {
        const y = point.y;
        if (isNumber(y)) values.push(y);
      }
    }
  }
  return values;
}

interface ColorScaleRange {
  from: number;
  to: number;
  name: string;
  color: string;
}

function formatRangeBound(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildValueBasedRanges(
  values: number[],
  palette: string[],
): ColorScaleRange[] {
  if (values.length === 0 || palette.length === 0) return [];
  const min = Math.floor(Math.min(...values));
  const max = Math.ceil(Math.max(...values));
  if (min === max) {
    return [
      {
        from: min,
        to: max,
        name: formatRangeBound(min),
        color: palette[palette.length - 1]!,
      },
    ];
  }
  const step = (max - min) / palette.length;
  return palette.map((color, index) => {
    const from = Math.round(min + step * index);
    const to =
      index === palette.length - 1 ? max : Math.round(min + step * (index + 1));
    return {
      from,
      to,
      name: `${formatRangeBound(from)} – ${formatRangeBound(to)}`,
      color,
    };
  });
}

/** Splits heatmap values into theme-relative ranges without Apex's white shading. */
export function applyValueBasedColorScale(
  plotOptions: NonNullable<ApexOptions["plotOptions"]>,
  input: UseApexChartInput,
  series: ChartSeries[],
  palette: string[],
): void {
  if (!VALUE_SCALED_TYPES.includes(input.type)) return;
  if (input.distributed) return;
  if (palette.length < 2) return;
  const subKey = VALUE_SCALED_PLOT_KEY[input.type]!;
  const subOptions = plotOptions[subKey] ?? {};
  const colors = heatmapRangeColors(
    palette,
    readThemeSurface(),
    Number(subOptions.shadeIntensity ?? 1),
  );
  const ranges = buildValueBasedRanges(extractNumericValues(series), colors);
  if (ranges.length === 0) return;
  subOptions.colorScale = { ranges };
  subOptions.enableShades = false;
  plotOptions[subKey] = subOptions;
}

/** Sets only the mode Apex's native heatmap shading reads. */
export function applyHeatmapThemeMode(
  baseOptions: ApexOptions,
  input: UseApexChartInput,
): void {
  if (!VALUE_SCALED_TYPES.includes(input.type)) return;
  baseOptions.theme = {
    mode: isDarkSurface(readThemeSurface()) ? "dark" : "light",
  };
}
