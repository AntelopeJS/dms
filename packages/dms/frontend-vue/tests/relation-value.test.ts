import { describe, expect, it } from "vitest";
import { sameRelationValue } from "../layers/dms-ui/app/build/composables/data-types/relationValue";

const ANN = { _id: "u-1", name: "Ann", avatar: "ann.png" };
const BOB = { _id: "u-2", name: "Bob" };
const SINGLE = { keyMapping: { label: "name", value: "_id" } };
const MULTIPLE = { ...SINGLE, multiple: true };

describe("sameRelationValue", () => {
  it("matches the row the server joined with the id the picker holds", () => {
    expect(sameRelationValue(ANN, "u-1", SINGLE)).toBe(true);
    expect(sameRelationValue("u-1", ANN, SINGLE)).toBe(true);
  });

  it("tells another row apart", () => {
    expect(sameRelationValue(ANN, "u-2", SINGLE)).toBe(false);
  });

  it("reads the id under the field's value key", () => {
    const bySlug = { keyMapping: { value: "slug" } };
    expect(sameRelationValue({ slug: "ann" }, "ann", bySlug)).toBe(true);
    expect(sameRelationValue({ slug: "ann", _id: "u-1" }, "u-1", bySlug)).toBe(
      false,
    );
  });

  it("compares the picks of a multiple relation as a set", () => {
    expect(sameRelationValue([ANN, BOB], ["u-2", "u-1"], MULTIPLE)).toBe(true);
    expect(sameRelationValue([ANN, BOB], ["u-1"], MULTIPLE)).toBe(false);
    expect(sameRelationValue([ANN], ["u-1", "u-1"], MULTIPLE)).toBe(false);
  });

  it("holds every empty value the same, and none the same as a pick", () => {
    expect(sameRelationValue(null, undefined, SINGLE)).toBe(true);
    expect(sameRelationValue([], undefined, MULTIPLE)).toBe(true);
    expect(sameRelationValue(null, "u-1", SINGLE)).toBe(false);
    expect(sameRelationValue([], [ANN], MULTIPLE)).toBe(false);
  });
});
