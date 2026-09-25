import { describe, expect, it } from "vitest";
import { buildRelationBadges } from "../layers/dms-ui/app/build/composables/data-types/relationBadges";

describe("buildRelationBadges", () => {
  it("reads each resolved related row through the label key", () => {
    expect(
      buildRelationBadges([{ name: "Admin" }, { name: "Billing" }], "name"),
    ).to.deep.equal({ visible: ["Admin", "Billing"], hidden: [] });
  });

  it("folds the labels past the limit into the hidden list", () => {
    const roles = ["A", "B", "C", "D", "E"].map((name) => ({ name }));
    expect(buildRelationBadges(roles, "name", 3)).to.deep.equal({
      visible: ["A", "B", "C"],
      hidden: ["D", "E"],
    });
  });

  it("shows a raw id when the relation was not resolved", () => {
    expect(buildRelationBadges(["role-1"], "name").visible).to.deep.equal([
      "role-1",
    ]);
  });

  it("drops items without a label and renders nothing for no value", () => {
    expect(buildRelationBadges([{ other: "x" }, null], "name")).to.deep.equal({
      visible: [],
      hidden: [],
    });
    expect(buildRelationBadges([], "name").visible).to.deep.equal([]);
  });
});
