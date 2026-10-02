import type { TreeLevel, TreePeriod } from "./tree-source";

export type Key = string | number | boolean | null;

export type Row = Record<string, unknown>;

interface Named {
  label: string;
}

export const PRIMARY_KEY = "_id";

const NO_VALUE = "None";

const LABEL_SEPARATOR = " · ";

const LOCALE = "en-US";

export const QUARTER_SHIFT = 10;
export const MONTH_SHIFT = 100;
export const DAY_SHIFT = 100;

export interface KeyCount {
  key: Key;
  count: number;
}

export type NamedRow = [Row, Named];

export function isKey(value: unknown): value is Key {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function dateText(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString(LOCALE, { timeZone: "UTC", ...options });
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return dateText(value, { month: "short", day: "numeric", year: "numeric" });
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return value.map(valueText).filter(Boolean).join(", ");
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }
  return JSON.stringify(value) ?? "";
}

function periodText(key: number, every: TreePeriod): string {
  if (every === "year") {
    return String(key);
  }
  if (every === "quarter") {
    return `Q${key % QUARTER_SHIFT} ${Math.floor(key / QUARTER_SHIFT)}`;
  }
  if (every === "month") {
    const month = new Date(
      Date.UTC(Math.floor(key / MONTH_SHIFT), (key % MONTH_SHIFT) - 1, 1),
    );
    return dateText(month, { month: "long", year: "numeric" });
  }
  const day = new Date(
    Date.UTC(
      Math.floor(key / (MONTH_SHIFT * DAY_SHIFT)),
      (Math.floor(key / DAY_SHIFT) % MONTH_SHIFT) - 1,
      key % DAY_SHIFT,
    ),
  );
  return dateText(day, { month: "short", day: "numeric", year: "numeric" });
}

export function groupText(key: Key, every: TreePeriod | undefined): string {
  if (key === null || key === "") {
    return NO_VALUE;
  }
  return every && typeof key === "number"
    ? periodText(key, every)
    : valueText(key);
}

export function rowText(row: Row, level: TreeLevel): string {
  const parts = (level.label ?? [])
    .map((field) => valueText(row[field]))
    .filter((part) => part !== "");
  return parts.length > 0
    ? parts.join(LABEL_SEPARATOR)
    : valueText(row[PRIMARY_KEY]);
}

export function byKey(a: Key, b: Key): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a).localeCompare(String(b), LOCALE, { numeric: true });
}

function byValue(a: unknown, b: unknown): number {
  const comparable = (value: unknown): Key =>
    value instanceof Date
      ? value.getTime()
      : isKey(value)
        ? value
        : valueText(value);
  return byKey(comparable(a ?? null), comparable(b ?? null));
}

export function byFields(
  level: TreeLevel,
): (a: NamedRow, b: NamedRow) => number {
  return ([rowA, itemA], [rowB, itemB]) => {
    for (const field of level.label ?? []) {
      const order = byValue(rowA[field], rowB[field]);
      if (order !== 0) {
        return order;
      }
    }
    return byKey(itemA.label, itemB.label);
  };
}
