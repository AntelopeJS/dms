import { describe, expect, it } from "vitest";
import {
  relationFilterParams,
  resolveRelationPick,
} from "../layers/dms-ui/app/entries/composables/data-types/relationFilter";

const BY_CUSTOMER = { field: "customer", from: "customer" };
const ACTIVE = { accessorKey: "isArchived", mode: "ne", value: "true" };

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

  it("always sends the fixed filter, whatever the source field holds", () => {
    expect(relationFilterParams(undefined, undefined, ACTIVE)).toEqual({
      filter_isArchived: "ne:true",
    });
    expect(relationFilterParams(BY_CUSTOMER, "c-1", ACTIVE)).toEqual({
      filter_isArchived: "ne:true",
      filter_customer: "is:c-1",
    });
  });

  it("sends a fixed filter that needs no value", () => {
    const params = relationFilterParams(undefined, undefined, {
      accessorKey: "closedAt",
      mode: "is_empty",
    });
    expect(params.filter_closedAt).toMatch(/^is_empty:/);
  });

  it("keeps both conditions when the fixed filter and filterBy share a field", () => {
    expect(
      relationFilterParams(BY_CUSTOMER, "c-1", {
        accessorKey: "customer",
        mode: "is_not",
        value: "c-9",
      }),
    ).toEqual({ filter_customer: ["is_not:c-9", "is:c-1"] });
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
