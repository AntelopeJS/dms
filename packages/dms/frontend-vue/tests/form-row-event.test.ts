import { describe, expect, it } from "vitest";
import { isRowEvent } from "../layers/dms-ui/app/build/composables/form/formComponentRealtime";

describe("isRowEvent", () => {
  it("accepts an update event of a row", () => {
    expect(
      isRowEvent({ type: "updated", payload: { ids: ["a"] }, actorId: "u1" }),
    ).toBe(true);
  });

  it("accepts an event with no payload or actor", () => {
    expect(isRowEvent({ type: "updated", payload: null, actorId: null })).toBe(
      true,
    );
    expect(isRowEvent({ type: "updated" })).toBe(true);
  });

  it("refuses a missing event", () => {
    expect(isRowEvent(null)).toBe(false);
    expect(isRowEvent(undefined)).toBe(false);
  });

  it("refuses ids that are not a list of ids", () => {
    expect(isRowEvent({ type: "updated", payload: { ids: "a" } })).toBe(false);
    expect(isRowEvent({ type: "updated", payload: { ids: [1] } })).toBe(false);
  });
});
