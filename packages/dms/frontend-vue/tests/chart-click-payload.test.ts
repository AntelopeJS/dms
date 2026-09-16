import { describe, expect, it } from "vitest";
import { readPointValue } from "../layers/dms-ui/app/composables/chart/events";

describe("readPointValue", () => {
  it("keeps a bare number in value", () => {
    expect(readPointValue(42)).toEqual({ value: 42 });
  });

  it("keeps a scalar point's y in value", () => {
    expect(readPointValue({ x: "10:00", y: 42 })).toEqual({ value: 42 });
  });

  it("keeps an explicit null y as a null value", () => {
    expect(readPointValue({ x: "10:00", y: null })).toEqual({ value: null });
  });

  it("moves a rangeArea tuple into values with a null value", () => {
    expect(readPointValue({ x: "10:00", y: [12, 48] })).toEqual({
      value: null,
      values: [12, 48],
    });
  });

  it("moves a candlestick tuple into values with a null value", () => {
    expect(readPointValue({ x: "Jan", y: [100, 120, 95, 110] })).toEqual({
      value: null,
      values: [100, 120, 95, 110],
    });
  });

  it("treats a missing point as a null value", () => {
    expect(readPointValue(undefined)).toEqual({ value: null });
  });
});
