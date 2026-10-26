/**
 * A number field's unit (`NumberType({ suffix })`) was written after its
 * form input only: table cells, expanded rows, cards and read-only fields
 * drew the bare number, so the unit disappeared from lists. Every place a
 * numeric type is drawn writes it, after the value formatted for the locale.
 * A formatter runs outside any component setup too (a footer sum, a group
 * header): the unit is translated without calling a composable.
 */
import { h } from "vue";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import {
  formatNumber,
  formatPercentage,
  formatPrice,
} from "../layers/dms-core/app/utils/formatter";
import { isObject } from "../layers/dms-core/app/utils/type-check";
import { withNumberSuffix } from "../layers/dms-ui/app/build/composables/data-types/numberSuffix";

const NBSP = " ";
const formatters = new Map<string, DataType["formatter"]>();

beforeAll(async () => {
  // As outside a setup: a composable throws, the app's composer answers.
  const outsideSetup = () => {
    throw new Error("Must be called at the top of a `setup` function");
  };
  vi.stubGlobal("useI18n", outsideSetup);
  vi.stubGlobal("useTranslation", outsideSetup);
  vi.stubGlobal("useDmsApp", () => ({
    $i18n: { t: (key: string) => `t($${key})` },
  }));
  vi.stubGlobal("h", h);
  vi.stubGlobal("isObject", isObject);
  vi.stubGlobal("formatNumber", formatNumber);
  vi.stubGlobal("formatPrice", formatPrice);
  vi.stubGlobal("formatPercentage", formatPercentage);
  for (const name of ["formatTimeSpan", "formatDate", "getBooleanLabel"]) {
    vi.stubGlobal(name, () => "");
  }
  vi.stubGlobal("useDataTypes", () => ({
    registerDataType: (dataType: DataType) =>
      formatters.set(dataType.id, dataType.formatter),
  }));
  const { registerDefaultDataTypes } = await import(
    "../layers/dms-ui/app/build/composables/data-types/registerDefaults"
  );
  registerDefaultDataTypes();
});

afterAll(() => vi.unstubAllGlobals());

describe("withNumberSuffix", () => {
  const format = withNumberSuffix(formatNumber);

  it("writes the unit after the number formatted for the locale", () => {
    expect(format(1234.5, "en-US", { suffix: "kWp", min: 0 })).toBe(
      `1,234.5${NBSP}kWp`,
    );
    expect(format(1234.5, "fr-FR", { suffix: "kWp" })).toBe(
      `${formatNumber(1234.5, "fr-FR")}${NBSP}kWp`,
    );
  });

  it("translates a unit given as an i18n key", () => {
    expect(format(30, "en-US", { suffix: "$billing.days" })).toBe(
      `30${NBSP}t($billing.days)`,
    );
  });

  it("leaves a number without a unit, and a value that is no number, as they were", () => {
    expect(format(12, "en-US", { min: 0 })).toBe("12");
    expect(format("n/a", "en-US", { suffix: "kWp" })).toBe("n/a");
  });
});

describe("the numeric data types", () => {
  const draw = (id: string, value: unknown, options: unknown) =>
    formatters.get(id)?.default(value, "en-US", options);

  it("write the unit in every place they are drawn", () => {
    expect(draw("number", 12.5, { suffix: "kWp" })).toBe(`12.5${NBSP}kWp`);
    expect(draw("price", 120, { suffix: "/ month" })).toBe(
      `€120.00${NBSP}/ month`,
    );
    expect(draw("percentage", 0.25, { suffix: "$x.yield" })).toBe(
      `25%${NBSP}t($x.yield)`,
    );
  });

  it("draw a bare number as before without one", () => {
    expect(draw("number", 12.5, { min: 0 })).toBe("12.5");
  });
});
