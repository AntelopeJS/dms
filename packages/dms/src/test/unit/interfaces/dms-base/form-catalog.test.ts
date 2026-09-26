import { expect } from "chai";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";

/**
 * A form's entries are a field or a group of fields, and both are objects: a
 * builder offering the two by their kind alone shows two tabs with one name.
 */
describe("[unit] interfaces/dms-base/form — its catalog entry", () => {
  function entryBranches() {
    const declared = ListBlockTypes().find((block) => block.type === "Form");
    return declared?.config.fields?.items?.oneOf ?? [];
  }

  it("names both kinds of entry a form's fields can hold", () => {
    expect(entryBranches().map((branch) => branch.ui?.label)).to.deep.equal([
      "Group",
      "Field",
    ]);
  });

  it("says a field's key and a group's can be derived from their label", () => {
    const [group, field] = entryBranches();
    expect(field?.properties?.id?.ui?.derivedFrom).to.equal("label");
    expect(group?.properties?.id?.ui?.derivedFrom).to.equal("label");
  });

  it("says a field's default takes the field's own type", () => {
    const [, field] = entryBranches();
    expect(field?.properties?.defaultValue?.ui?.typedBy).to.equal("type");
  });

  it("is placed showing its buttons, a setting of the advanced view", () => {
    const config = ListBlockTypes().find(
      (block) => block.type === "Form",
    )?.config;
    expect(config?.showActions?.ui).to.include({
      initial: true,
      advanced: true,
    });
  });

  it("leaves its addresses and methods to the advanced view", () => {
    const config = ListBlockTypes().find(
      (block) => block.type === "Form",
    )?.config;
    for (const key of [
      "fetchUrl",
      "fetchUrlMethod",
      "submitUrl",
      "submitUrlMethod",
    ]) {
      expect(config?.[key]?.ui?.advanced, key).to.equal(true);
    }
  });

  it("names what a group of fields is set up with", () => {
    const [group] = entryBranches();
    expect(group?.properties?.label?.ui?.label).to.equal("Title");
    expect(group?.properties?.fields?.ui?.label).to.equal("Fields");
  });

  for (const type of ["Form", "ResourceForm"]) {
    it(`puts the submit messages of a ${type} behind one switch`, () => {
      const config = ListBlockTypes().find(
        (block) => block.type === type,
      )?.config;
      expect(config?.successMessage?.ui).to.include({
        optIn: "Custom submit messages",
        placeholder: "Data has been successfully saved",
      });
      expect(config?.errorMessage?.ui).to.include({
        optIn: "Custom submit messages",
        placeholder: "An unknown error occurred",
      });
    });
  }
});
