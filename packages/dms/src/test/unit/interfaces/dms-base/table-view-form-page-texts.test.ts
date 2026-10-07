import { expect } from "chai";
import { resolveFormPageTexts } from "@antelopejs/interface-dms/base/table-view/internal/factory-helpers";

const TASK_PAGES = {
  new: { displayName: "$tasks.form.new_title" },
  edit: {
    displayName: "$tasks.form.edit_title",
    description: "$tasks.form.edit_description",
  },
  details: { displayName: "$tasks.form.view_title" },
};

describe("TableView form page texts", () => {
  it("titles each page with its formContainer.pages entry", () => {
    expect(resolveFormPageTexts("edit", TASK_PAGES)).to.eql({
      displayName: "$tasks.form.edit_title",
      description: "$tasks.form.edit_description",
    });
  });

  it("reads the details page from the `details` entry", () => {
    expect(resolveFormPageTexts("view", TASK_PAGES).displayName).to.equal(
      "$tasks.form.view_title",
    );
  });

  it("completes partial texts with the generic entry texts", () => {
    expect(resolveFormPageTexts("new", TASK_PAGES)).to.eql({
      displayName: "$tasks.form.new_title",
      description: "$dms.table.new_item_description",
    });
  });

  it("falls back to the generic texts of each kind", () => {
    expect(resolveFormPageTexts("view")).to.eql({
      displayName: "$dms.table.view_item",
      description: "$dms.table.view_item_description",
    });
  });
});
