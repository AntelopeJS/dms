import { describe, expect, it } from "vitest";
import {
  createStartingValueTracker,
  resolveFieldValueWrite,
} from "../layers/dms-ui/app/build/composables/form/fieldValueRule";

const PROBABILITY_BY_STAGE = {
  targetField: "probability",
  valueMap: { won: 100, lost: 0 },
};

describe("resolveFieldValueWrite", () => {
  it("writes the map entry named by the changed field's value", () => {
    expect(
      resolveFieldValueWrite(PROBABILITY_BY_STAGE, {
        fieldId: "stage",
        value: "won",
      }),
    ).toEqual({ value: 100 });
    expect(
      resolveFieldValueWrite(PROBABILITY_BY_STAGE, {
        fieldId: "stage",
        value: "lost",
      }),
    ).toEqual({ value: 0 });
  });

  it("writes nothing for a value the map does not name", () => {
    expect(
      resolveFieldValueWrite(PROBABILITY_BY_STAGE, { value: "qualified" }),
    ).toBeUndefined();
    expect(
      resolveFieldValueWrite(PROBABILITY_BY_STAGE, { value: "toString" }),
    ).toBeUndefined();
    expect(
      resolveFieldValueWrite(PROBABILITY_BY_STAGE, { value: ["won"] }),
    ).toBeUndefined();
  });

  it("writes a fixed value, an empty one included", () => {
    expect(
      resolveFieldValueWrite(
        { targetField: "lostReason", value: null },
        { value: "won" },
      ),
    ).toEqual({ value: null });
  });

  it("writes nothing without a value or a map", () => {
    expect(
      resolveFieldValueWrite({ targetField: "x" }, { value: "won" }),
    ).toBeUndefined();
  });

  it("never writes over the values the form started from", () => {
    expect(
      resolveFieldValueWrite(PROBABILITY_BY_STAGE, {
        value: "won",
        initial: true,
      }),
    ).toBeUndefined();
  });
});

describe("createStartingValueTracker", () => {
  const started = new Map([["stage", "won"]]);
  const isStarting = (
    fieldId: string,
    value: Parameters<Parameters<typeof createStartingValueTracker>[0]>[1],
  ) => started.get(fieldId) === value;

  it("flags the value a field started from", () => {
    const isInitial = createStartingValueTracker(isStarting);
    expect(isInitial("stage", "won")).toBe(true);
    expect(isInitial("stage", "won")).toBe(true);
  });

  it("treats coming back to it after a change as a change", () => {
    const isInitial = createStartingValueTracker(isStarting);
    expect(isInitial("stage", "won")).toBe(true);
    expect(isInitial("stage", "lost")).toBe(false);
    expect(isInitial("stage", "won")).toBe(false);
  });

  it("tracks each field on its own", () => {
    const isInitial = createStartingValueTracker(isStarting);
    expect(isInitial("probability", 70)).toBe(false);
    expect(isInitial("stage", "won")).toBe(true);
  });
});
