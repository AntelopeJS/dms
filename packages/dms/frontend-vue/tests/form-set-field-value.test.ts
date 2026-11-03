import { describe, expect, it } from "vitest";
import {
  createStartingValueTracker,
  readFieldFlagParams,
  readSetFieldValueParams,
  resolveFieldValueWrite,
} from "../layers/dms-ui/app/entries/composables/form/fieldValueRule";

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

describe("readSetFieldValueParams", () => {
  it("reads the target, a fixed value and a map as the watch carries them", () => {
    expect(
      readSetFieldValueParams({
        targetField: "probability",
        valueMap: { won: 100 },
      }),
    ).toEqual({ targetField: "probability", valueMap: { won: 100 } });
    expect(
      readSetFieldValueParams({ targetField: "lostReason", value: null }),
    ).toEqual({ targetField: "lostReason", value: null });
    expect(readSetFieldValueParams({ targetField: "x" })).toEqual({
      targetField: "x",
    });
  });

  it("feeds the rule the same answers the watch's own params gave it", () => {
    const params = readSetFieldValueParams(PROBABILITY_BY_STAGE);
    expect(params).toBeDefined();
    expect(
      resolveFieldValueWrite(params!, { fieldId: "stage", value: "won" }),
    ).toEqual({ value: 100 });
    expect(
      resolveFieldValueWrite(params!, { value: "toString" }),
    ).toBeUndefined();
  });

  it("keeps a falsy map out of the way of a fixed value", () => {
    const params = readSetFieldValueParams({
      targetField: "x",
      value: 1,
      valueMap: null,
    });
    expect(resolveFieldValueWrite(params!, { value: "a" })).toEqual({
      value: 1,
    });
  });

  it("reads nothing from params that name no string target or hold a map that is no object", () => {
    expect(readSetFieldValueParams(undefined)).toBeUndefined();
    expect(readSetFieldValueParams({})).toBeUndefined();
    expect(readSetFieldValueParams({ targetField: 7 })).toBeUndefined();
    expect(
      readSetFieldValueParams({ targetField: "x", valueMap: true }),
    ).toBeUndefined();
  });
});

describe("readFieldFlagParams", () => {
  it("reads the target and whether the flag is set", () => {
    expect(
      readFieldFlagParams({ targetField: "a", setHidden: true }, "setHidden"),
    ).toEqual({ targetField: "a", flag: true });
    expect(
      readFieldFlagParams({ targetField: "a", setHidden: false }, "setHidden"),
    ).toEqual({ targetField: "a", flag: false });
  });

  it("reads a missing or other flag as unset, as the watch always did", () => {
    expect(readFieldFlagParams({ targetField: "a" }, "setHidden")).toEqual({
      targetField: "a",
      flag: false,
    });
    expect(
      readFieldFlagParams({ targetField: "a", setDisabled: true }, "setHidden"),
    ).toEqual({ targetField: "a", flag: false });
  });

  it("does not take an inherited member for the flag", () => {
    expect(readFieldFlagParams({ targetField: "a" }, "toString")).toEqual({
      targetField: "a",
      flag: false,
    });
  });

  it("reads nothing from params that name no string target", () => {
    expect(readFieldFlagParams(undefined, "setHidden")).toBeUndefined();
    expect(readFieldFlagParams({ setHidden: true }, "setHidden")).toBeUndefined();
    expect(
      readFieldFlagParams({ targetField: 7, setHidden: true }, "setHidden"),
    ).toBeUndefined();
  });
});
