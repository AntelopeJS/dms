import { describe, expect, it } from "vitest";
import {
  relationFilterParams,
  resolveRelationPick,
} from "../layers/dms-ui/app/entries/composables/data-types/relationFilter";

const BY_CUSTOMER = { field: "customer", from: "customer" };

describe("relationFilterParams", () => {
  it("narrows the search with the related table's filter syntax", () => {
    expect(relationFilterParams(BY_CUSTOMER, "c-1")).toEqual({
      filter_customer: "is:c-1",
    });
    expect(relationFilterParams(BY_CUSTOMER, 3)).toEqual({
      filter_customer: "is:3",
    });
  });

  it("offers every row while the source field holds no single value", () => {
    expect(relationFilterParams(BY_CUSTOMER, undefined)).toEqual({});
    expect(relationFilterParams(BY_CUSTOMER, "")).toEqual({});
    expect(relationFilterParams(BY_CUSTOMER, null)).toEqual({});
    expect(relationFilterParams(BY_CUSTOMER, ["c-1"])).toEqual({});
  });

  it("adds nothing to a picker without filterBy", () => {
    expect(relationFilterParams(undefined, "c-1")).toEqual({});
  });
});

describe("resolveRelationPick", () => {
  const loaded = {
    source: "c-1",
    pick: "s-1",
    previousSource: "c-1",
    previousPick: "s-1",
    pickSource: "c-1",
  };

  it("clears a pick once the source field takes another value", () => {
    expect(resolveRelationPick({ ...loaded, source: "c-2" })).toEqual({
      shouldClear: true,
      pickSource: "c-1",
    });
  });

  it("keeps the pick when the source goes back to the value it was made with", () => {
    expect(
      resolveRelationPick({ ...loaded, previousSource: "c-2", source: "c-1" }),
    ).toEqual({ shouldClear: false, pickSource: "c-1" });
  });

  it("keeps a pick loaded with its source in the same change", () => {
    expect(
      resolveRelationPick({
        ...loaded,
        source: "c-2",
        pick: "s-9",
      }),
    ).toEqual({ shouldClear: false, pickSource: "c-2" });
  });

  it("ties a new pick to the current source", () => {
    expect(
      resolveRelationPick({
        source: "c-2",
        previousSource: "c-2",
        pick: "s-2",
        previousPick: undefined,
        pickSource: "c-1",
      }),
    ).toEqual({ shouldClear: false, pickSource: "c-2" });
  });

  it("has nothing to clear without a pick", () => {
    expect(
      resolveRelationPick({
        source: "c-2",
        previousSource: "c-1",
        pick: [],
        previousPick: [],
        pickSource: "c-1",
      }),
    ).toEqual({ shouldClear: false, pickSource: "c-2" });
  });
});
