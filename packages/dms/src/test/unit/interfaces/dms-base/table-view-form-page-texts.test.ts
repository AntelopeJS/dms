import { expect } from "chai";
import { resolveFormPageTexts } from "@antelopejs/interface-dms/base/table-view/factory-helpers";

const TASK_TEXTS = {
  new: { title: "$tasks.form.new_title" },
  edit: {
    title: "$tasks.form.edit_title",
    description: "$tasks.form.edit_description",
  },
};

describe("TableView form page texts", () => {
  it("titles each page with the table's own texts", () => {
    expect(resolveFormPageTexts("edit", { formTexts: TASK_TEXTS })).to.eql({
      title: "$tasks.form.edit_title",
      description: "$tasks.form.edit_description",
    });
  });

  it("lets a page-mode page entry win over the table's texts", () => {
    expect(
      resolveFormPageTexts(
        "edit",
        { formTexts: TASK_TEXTS },
        { edit: { displayName: "Rename", description: "Its new name." } },
      ),
    ).to.eql({ title: "Rename", description: "Its new name." });
  });

  it("completes partial texts with the generic entry texts", () => {
    expect(resolveFormPageTexts("new", { formTexts: TASK_TEXTS })).to.eql({
      title: "$tasks.form.new_title",
      description: "$dms.table.new_item_description",
    });
  });

  it("falls back to the generic texts of each kind", () => {
    expect(resolveFormPageTexts("view", {})).to.eql({
      title: "$dms.table.view_item",
      description: "$dms.table.view_item_description",
    });
  });
});
