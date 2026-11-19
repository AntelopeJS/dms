import { startOfDay } from "./generate";
import type { Json, JsonObject } from "./model";

const SAMPLE_ROW_COUNT = 3;

export interface SampleColumn {
  field: string;
  label: string;
  type: string;
}

type SampleValue = (row: number, label: string, today: number) => Json;

const SAMPLE_DAY_MS = 86_400_000;
const SAMPLE_STEP = 10;

const TEXT: SampleValue = (row, label) => `Sample ${label} ${row}`;

/** The sample value of a column, by its data type id; any other type reads as text. */
const SAMPLES = new Map<string, SampleValue>([
  ["number", (row) => row * SAMPLE_STEP],
  ["price", (row) => row * SAMPLE_STEP],
  ["percentage", (row) => row / SAMPLE_STEP],
  ["boolean", (row) => row % 2 === 1],
  [
    "date",
    (row, _label, today) => new Date(today - row * SAMPLE_DAY_MS).toISOString(),
  ],
  ["email", (row) => `sample${row}@example.com`],
]);

/**
 * Rows a table of `columns` lists in its mockup: made up from each column's
 * type and header, never read from the live page. They are the same on every
 * call of one day: a date column counts the rows back from the start of
 * `now`'s UTC day, one day apart, so the rows are recent.
 */
export function sampleRows(
  columns: readonly SampleColumn[],
  now: number,
): JsonObject[] {
  const today = startOfDay(now);
  return Array.from({ length: SAMPLE_ROW_COUNT }, (_, index) => {
    const row: JsonObject = { _id: `sample-${index + 1}` };
    for (const column of columns) {
      const sample = SAMPLES.get(column.type) ?? TEXT;
      row[column.field] = sample(index + 1, column.label, today);
    }
    return row;
  });
}
