import type { ChartXAxisFormatter } from "./types";

/**
 * Width of one character of the axis font (11px, monospace) in pixels, with a
 * little room for a proportional fallback font.
 */
const AXIS_CHAR_WIDTH = 7;
/** Blank space kept between two neighbouring labels. */
const LABEL_GAP = 8;

/** What Apex hands an x-axis label formatter (`xaxis.labels.formatter`). */
interface ApexLabelFormatterOpts {
  /** The label's column; only set while Apex draws the axis. */
  i?: number;
  w?: { globals?: { gridWidth?: number; labels?: unknown[] } };
}

type ApexLabelFormatter = (
  value: string,
  timestamp?: number,
  opts?: ApexLabelFormatterOpts,
) => string;

/**
 * How many columns each drawn label stands for: 1 while every label fits its
 * column, more once the longest one is wider than a column.
 */
export function categoryLabelStep(
  gridWidth: number,
  labelCount: number,
  longestLabel: number,
): number {
  if (labelCount <= 1 || gridWidth <= 0) return 1;
  const columnWidth = gridWidth / labelCount;
  const labelWidth = longestLabel * AXIS_CHAR_WIDTH + LABEL_GAP;
  return Math.max(1, Math.ceil(labelWidth / columnWidth));
}

/**
 * A heatmap gives every column a label and ApexCharts does not thin them
 * (`hideOverlappingLabels` only acts on other charts), so on a phone they run
 * into each other ("07:0009:00"). This formatter keeps one label every few
 * columns, from the plot's width, and leaves the tooltip's (no column index)
 * whole.
 */
export function thinnedCategoryFormatter(
  format: ChartXAxisFormatter | undefined,
): ApexLabelFormatter {
  const write = (value: string, timestamp?: number): string =>
    format ? format(value, timestamp) : String(value ?? "");
  return (value, timestamp, opts) => {
    const label = write(value, timestamp);
    const index = opts?.i;
    const globals = opts?.w?.globals;
    if (typeof index !== "number" || !globals) return label;
    const labels = globals.labels ?? [];
    const longest = labels.reduce<number>(
      (max, entry) => Math.max(max, write(String(entry ?? "")).length),
      0,
    );
    const step = categoryLabelStep(
      globals.gridWidth ?? 0,
      labels.length,
      longest,
    );
    return index % step === 0 ? label : "";
  };
}
