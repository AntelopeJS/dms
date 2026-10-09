import { expect } from "chai";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";
import {
  ActivityFeed,
  FieldRow,
  Meter,
  Section,
} from "@antelopejs/interface-dms/base";

function declared(type: string) {
  const block = ListBlockTypes().find((entry) => entry.type === type);
  expect(block, `${type} is declared`).to.not.equal(undefined);
  return block!;
}

/**
 * The list and settings blocks reach a builder through the catalog: the
 * factory's component name, whether it takes children, and the options an
 * editor offers have to agree with what the factory emits.
 */
describe("[unit] interfaces/dms-base — list and settings blocks in the catalog", () => {
  it("declares each block with the component its factory emits", () => {
    const pairs: Array<[string, string]> = [
      ["ActivityFeed", ActivityFeed().serializeSync().componentName],
      ["Meter", Meter().serializeSync().componentName],
      ["Section", Section().serializeSync().componentName],
      ["FieldRow", FieldRow().serializeSync().componentName],
    ];
    for (const [type, componentName] of pairs) {
      expect(declared(type).componentName, type).to.equal(componentName);
    }
  });

  it("lets a section and a field row hold children, not a feed or a meter", () => {
    expect(declared("Section").container).to.equal(true);
    expect(declared("FieldRow").container).to.equal(true);
    expect(declared("ActivityFeed").container).to.not.equal(true);
    expect(declared("Meter").container).to.not.equal(true);
  });

  it("offers the options an author sets on each block", () => {
    expect(declared("ActivityFeed").config).to.include.keys(
      "items",
      "fetchUrl",
      "groupByDay",
      "maxItems",
      "fillHeight",
      "skeletonCount",
      "actions",
    );
    expect(declared("Meter").config).to.include.keys(
      "value",
      "max",
      "segments",
      "warnAt",
      "errorAt",
      "format",
    );
    expect(declared("FieldRow").config.layout?.enum).to.deep.equal([
      "inline",
      "form",
      "stack",
    ]);
    expect(declared("Section").config).to.include.keys("danger", "card");
  });

  it("offers the sticky save bar on a form", () => {
    expect(declared("Form").config.saveMode?.enum).to.include("bar");
  });
});
