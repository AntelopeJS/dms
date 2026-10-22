/**
 * A filter chip shows the date a relative token stands for (`{{now-30d}}`),
 * not "Unknown": the token is resolved the way the server resolves it before
 * the column's formatter writes it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatFilterValue,
  resolveNowTokens,
} from "../layers/dms-ui/app/build/composables/table/utils/formatFilterValue";
import type { TableFilter } from "../layers/dms-ui/app/build/components/table/Table.vue";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const day = (value: unknown) =>
  Number.isNaN(new Date(value as string).getTime())
    ? "Unknown"
    : new Date(value as string).toISOString().slice(0, 10);

const dateType = {
  id: "date",
  formatter: {
    default: day,
    is_between: (value: unknown) =>
      Array.isArray(value) ? value.map(day).join(" - ") : "Unknown - Unknown",
  },
} as unknown as DataType;
const columns = [{ value: "paidAt", label: "Paid", type: { id: "date" } }];

const chip = (mode: string, value: unknown) =>
  formatFilterValue(
    { accessorKey: "paidAt", mode, value } as TableFilter,
    columns as never,
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
