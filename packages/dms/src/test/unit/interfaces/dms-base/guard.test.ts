import { expect } from "chai";
import {
  GetBlockType,
  ValidateBlockOptions,
} from "@antelopejs/interface-dms/base/block-types";
import { Guard } from "@antelopejs/interface-dms/base/guard";

function declared(type: string) {
  const block = GetBlockType(type);
  expect(block, `${type} is declared`).to.not.equal(undefined);
  return block!;
}

const valid = (options: Parameters<typeof ValidateBlockOptions>[1]) =>
  ValidateBlockOptions("Guard", options).valid;

const GUARD = {
  fetchUrl: "/api/routes/activity?route={{query.route}}",
  field: "calls",
  fallback: {
    title: "No calls yet",
    actions: [{ label: "Test this route", to: "/routes?tab=2" }],
  },
};

/**
 * A Guard wraps any blocks and shows one empty state in their place when a
 * route says there is nothing for them: the value it names is empty, or the
 * route answers 404.
 */
describe("[unit] interfaces/dms-base — Guard", () => {
  it("is a layout container taking any child", () => {
    const block = declared("Guard");
    expect(block.container).to.equal(true);
    expect(block.allowedChildren).to.equal(undefined);
    expect(block.meta.group).to.equal("layout");
    expect(block.componentName).to.equal("dms-guard");
  });

  it("reads a route that may follow a period scope", () => {
    const { config } = declared("Guard");
    expect(config.fetchUrl?.optional).to.not.equal(true);
    expect(config.fetchUrl?.ui?.periodOption).to.equal("periodScope");
    expect(config.periodScope?.optional).to.equal(true);
    expect(config.realtimeTopic?.optional).to.equal(true);
  });

  it("checks for an empty value unless told notFound", () => {
    const { config, defaults } = declared("Guard");
    expect(config.when?.enum).to.deep.equal(["empty", "notFound"]);
    expect(defaults.when).to.equal("empty");
  });

  it("needs a route; the field and the fallback are optional", () => {
    expect(valid(GUARD)).to.equal(true);
    expect(valid({ ...GUARD, fetchUrl: undefined })).to.equal(false);
    expect(
      valid({ fetchUrl: "/api/routes/{{params.id}}", when: "notFound" }),
    ).to.equal(true);
    expect(valid({ ...GUARD, fallback: { description: "Not yet" } })).to.equal(
      true,
    );
    expect(valid({ ...GUARD, when: "missing" })).to.equal(false);
  });

  it("serializes its options with the default condition", async () => {
    const serialized = await Guard(GUARD).serialize();
    expect(serialized.componentName).to.equal("dms-guard");
    expect(serialized.options).to.deep.include({ ...GUARD, when: "empty" });
  });
});
