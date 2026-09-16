export type PeriodPreset =
  | "last-hour"
  | "last-24h"
  | "today"
  | "yesterday"
  | "last-7-days"
  | "last-30-days"
  | "last-90-days"
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "ytd"
  | "last-year"
  | "custom";

export type PeriodComparison =
  | "none"
  | "previous-period"
  | "previous-year"
  | "custom";

export interface PeriodRange {
  from: Date;
  to: Date;
}

export interface PeriodState {
  preset: PeriodPreset;
  comparison: PeriodComparison;
  range: PeriodRange;
  compareRange: PeriodRange | null;
  key: string;
}

export const MS_PER_HOUR = 3600000;
export const MS_PER_DAY = 86400000;

export const END_OF_DAY_HOURS = 23;
export const END_OF_DAY_MINUTES = 59;
export const END_OF_DAY_SECONDS = 59;
export const END_OF_DAY_MS = 999;

export const DEFAULT_PRESETS: PeriodPreset[] = [
  "this-month",
  "last-month",
  "this-quarter",
  "last-quarter",
  "ytd",
  "last-year",
  "last-7-days",
  "last-30-days",
];

export const DEFAULT_COMPARISONS: PeriodComparison[] = [
  "none",
  "previous-period",
  "previous-year",
];
