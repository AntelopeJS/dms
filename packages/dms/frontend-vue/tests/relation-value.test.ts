import { describe, expect, it } from "vitest";
import {
  relationIdsQuery,
  sameRelationValue,
  unlabeledRelationIds,
} from "../layers/dms-ui/app/build/composables/data-types/relationValue";

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

describe("unlabeledRelationIds", () => {
  const labeled = new Set(["u-1"]);

  it("returns a plain id no known row labels", () => {
    expect(unlabeledRelationIds("u-2", labeled)).toEqual(["u-2"]);
    expect(unlabeledRelationIds("u-1", labeled)).toEqual([]);
  });

  it("returns each unlabeled id of a multiple relation once", () => {
    expect(unlabeledRelationIds(["u-1", "u-2", 3, "u-2"], labeled)).toEqual([
      "u-2",
      "3",
    ]);
  });

  it("leaves joined rows and empty values alone", () => {
    expect(unlabeledRelationIds(ANN, labeled)).toEqual([]);
    expect(unlabeledRelationIds([BOB], labeled)).toEqual([]);
    expect(unlabeledRelationIds(undefined, labeled)).toEqual([]);
    expect(unlabeledRelationIds("", labeled)).toEqual([]);
  });
});

describe("relationIdsQuery", () => {
  it("asks for those rows alone, on the field's value key", () => {
    expect(relationIdsQuery(["u-1", "u-2"], { value: "_id" })).toEqual({
      ids: ["u-1", "u-2"],
      idKey: "_id",
      limit: 2,
    });
  });

  it("leaves the key to the route when none is mapped", () => {
    expect(relationIdsQuery(["u-1"])).toEqual({ ids: ["u-1"], limit: 1 });
  });
});
