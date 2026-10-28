// @vitest-environment jsdom
/**
 * A `string_time` value reads as a duration in the reader's locale, wherever
 * a formatter shows it (a cell, a field's "before" note): the formatter's
 * second argument is the locale, never a separator (`7hfr30m`).
 */
import { h } from "vue";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { isNumber, isObject } from "../layers/dms-core/app/utils/type-check";

type Formatter = (value: unknown, locale: string) => unknown;

const formatters = new Map<string, Formatter>();
const register = (dataType: DataType) =>
  formatters.set(dataType.id, dataType.formatter?.default as Formatter);

beforeAll(async () => {
  vi.stubGlobal("h", h);
  vi.stubGlobal("isObject", isObject);
  vi.stubGlobal("isNumber", isNumber);
  for (const name of ["formatNumber", "formatPrice", "formatPercentage"]) {
    vi.stubGlobal(name, () => "");
  }
  vi.stubGlobal("useDataTypes", () => ({ registerDataType: register }));
  const { registerDefaultDataTypes } = await import(
    "../layers/dms-ui/app/build/composables/data-types/registerDefaults"
  );
  registerDefaultDataTypes();
});

const HOUR = 3_600_000;
const MINUTE = 60_000;

describe("string_time display", () => {
  it("writes the duration in the locale, not the locale in it", () => {
    const format = formatters.get("string_time")!;
    const text = String(format(7 * HOUR + 30 * MINUTE, "fr"));
    expect(text).not.toContain("fr");
    expect(text.replace(/\s/g, " ")).toBe("7 h 30 min");
  });

  it("rounds the duration a cell shows", () => {
    const format = formatters.get("string_time")!;
    const text = String(format(7 * HOUR + 30 * MINUTE + 15_250, "en"));
    expect(text.replace(/\s/g, " ")).toBe("7 h 30 min");
  });

  it("leaves a value that is no duration as it is", () => {
    expect(formatters.get("string_time")!(undefined, "en")).toBeUndefined();
  });
});
