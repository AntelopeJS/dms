/**
 * A filter chip shows the date a relative token stands for (`{{now-30d}}`),
 * not "Unknown": the token is resolved the way the server resolves it before
 * the column's formatter writes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatFilterValue,
  resolveNowTokens,
} from "../layers/dms-ui/app/entries/composables/table/utils/formatFilterValue";
import type { TableFilter } from "../layers/dms-ui/app/entries/components/table/Table";
import type { DataTypeFormatter } from "../layers/dms-core/app/composables/data-types/useDataType";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const day = (value: Parameters<DataTypeFormatter>[0]) => {
  // SAFETY: These date fixtures and the resolved tokens supply ISO date strings to the formatter.
  const text = value as string;
  return Number.isNaN(new Date(text).getTime())
    ? "Unknown"
    : new Date(text).toISOString().slice(0, 10);
};

const dateType: DataType = {
  id: "date",
  formatter: {
    default: day,
    is_between: (value: Parameters<DataTypeFormatter>[0]) =>
      Array.isArray(value) ? value.map(day).join(" - ") : "Unknown - Unknown",
  },
};
const columns: Parameters<typeof formatFilterValue>[1] = [
  {
    value: "paidAt",
    label: "Paid",
    type: {
      id: "date",
      compareModes: [],
      filterComponents: {},
      inputComponent: {},
    },
  },
];

const chip = (mode: string, value: TableFilter["value"]) =>
  formatFilterValue(
    { accessorKey: "paidAt", mode, value },
    columns,
    () => dateType,
    "en",
  );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a relative-date filter chip", () => {
  it("shows the date a single token stands for", () => {
    expect(chip("greater_than", "{{now-30d}}")).toBe("2026-09-19");
    expect(chip("less_than", "{{ now + 7d }}")).toBe("2026-10-26");
    expect(chip("is", "{{now}}")).toBe("2026-10-19");
  });

  it("shows both bounds of a range written as text", () => {
    expect(chip("is_between", "{{now}},{{now+7d}}")).toBe(
      "2026-10-19 - 2026-10-26",
    );
    expect(chip("is_between", "2026-01-01, 2026-02-01")).toBe(
      "2026-01-01 - 2026-02-01",
    );
  });

  it("leaves other values to the formatter as they are", () => {
    expect(chip("is_between", ["2026-01-01", "2026-02-01"])).toBe(
      "2026-01-01 - 2026-02-01",
    );
    expect(chip("is", "2026-03-04")).toBe("2026-03-04");
  });
});

describe("resolveNowTokens", () => {
  it("keeps the text around the tokens and other tokens", () => {
    expect(resolveNowTokens("{{now-1d}},{{user.id}}", NOW)).toBe(
      "2026-10-18T12:00:00.000Z,{{user.id}}",
    );
  });
});
