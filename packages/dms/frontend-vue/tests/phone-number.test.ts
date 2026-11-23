/**
 * @packageDocumentation
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { h } from "vue";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { isObject } from "../layers/dms-core/app/utils/type-check";
import {
  formatPhone,
  moveToCountry,
  readTypedPhone,
  toE164,
} from "../layers/dms-ui/app/entries/utils/phoneNumber";

describe("phone numbers", () => {
  it("reads every common spelling of a number in its country as E.164", () => {
    for (const typed of [
      "0494669443",
      "0494 66 94 43",
      "+32494 66 94 43",
      "0032 494 66 94 43",
      "+32 (0)494 66.94.43",
    ]) {
      expect(toE164(typed, "BE"), typed).toBe("+32494669443");
    }
  });

  it("reads a prefixed number in the country its prefix names", () => {
    expect(toE164("+33 1 23 45 67 89", "BE")).toBe("+33123456789");
    expect(toE164("0033123456789")).toBe("+33123456789");
  });

  it("reads no number from a national number without a country, a short one or words", () => {
    expect(toE164("0494669443")).toBeUndefined();
    expect(toE164("+32 494", "BE")).toBeUndefined();
    expect(toE164("call 0494669443", "BE")).toBeUndefined();
  });

  it("formats a stored E.164 value internationally and leaves anything else as stored", () => {
    expect(formatPhone("+32494669443")).toBe("+32 494 66 94 43");
    expect(formatPhone("0494669443")).toBe("0494669443");
    expect(formatPhone("+32 494 66 94 43")).toBe("+32 494 66 94 43");
  });

  it("detects the country a typed prefix names", () => {
    expect(readTypedPhone("+33 1 23", "BE").country).toBe("FR");
    expect(readTypedPhone("0032 494 66", undefined)).toMatchObject({
      text: "+32 494 66",
      country: "BE",
    });
  });

  it("moves an international number to another calling code, and leaves a national one", () => {
    expect(moveToCountry("+32 494 66 94 43", "BE", "FR")).toBe(
      "+33 4 94 66 94 43",
    );
    expect(moveToCountry("0494 66 94 43", "BE", "FR")).toBe("0494 66 94 43");
  });
});

describe("phone cell", () => {
  it("draws a stored E.164 value internationally, and any other value as stored", async () => {
    const formatters = new Map<string, DataType["formatter"]>();
    vi.stubGlobal("h", h);
    vi.stubGlobal("isObject", isObject);
    for (const name of [
      "formatNumber",
      "formatPrice",
      "formatPercentage",
      "formatTimeSpan",
      "formatDate",
    ]) {
      vi.stubGlobal(name, () => "");
    }
    vi.stubGlobal("useDataTypes", () => ({
      registerDataType: (dataType: DataType) =>
        formatters.set(dataType.id, dataType.formatter),
    }));
    const { registerDefaultDataTypes } = await import(
      "../layers/dms-ui/app/entries/composables/data-types/registerDefaults"
    );
    registerDefaultDataTypes();
    const format = formatters.get("phone")?.default;
    expect(format?.("+32494669443", "en-GB")).toBe("+32 494 66 94 43");
    expect(format?.("0494669443", "en-GB")).toBe("0494669443");
    vi.unstubAllGlobals();
  });
});
