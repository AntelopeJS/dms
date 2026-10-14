import { expect } from "chai";
import {
  type ConfirmDialog,
  serializeConfirmDialog,
} from "@antelopejs/interface-dms/base/table-view";

describe("[unit] interfaces/dms-base/confirm-dialog — secondary action", () => {
  it("serves the secondary action as declared", () => {
    const dialog: ConfirmDialog = {
      title: "$lang.remove_title",
      params: { code: "fr" },
      secondaryAction: {
        label: "Download {code}.json",
        icon: "i-ph-download-simple",
        target: {
          type: "download",
          url: "/legacy/lang/{{row.code}}.json",
          filename: "{{row.code}}.json",
        },
      },
    };
    expect(serializeConfirmDialog(dialog).secondaryAction).to.deep.equal(
      dialog.secondaryAction,
    );
  });

  it("leaves it out of a dialog that declares none", () => {
    expect(serializeConfirmDialog({ title: "Remove?" })).to.not.have.property(
      "secondaryAction",
    );
  });
});
