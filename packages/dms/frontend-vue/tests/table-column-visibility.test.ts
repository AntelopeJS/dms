import { describe, expect, it } from "vitest";
import { buildInitialColumnVisibility } from "../layers/dms-ui/app/build/composables/table-view/utils/columnVisibility";

describe("buildInitialColumnVisibility", () => {
  it("hides the columns declared isVisible: false", () => {
    expect(
      buildInitialColumnVisibility([
        { id: "number" },
        { id: "amount", isVisible: true },
        { id: "stripeId", isVisible: false },
      ]),
    ).toEqual({ number: true, amount: true, stripeId: false });
  });

  it("keeps every column visible when none opts out", () => {
    expect(buildInitialColumnVisibility([{ id: "name" }])).toEqual({
      name: true,
    });
  });
});
