import { GetMetadata } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  type FormFieldSerialized,
  type FormPropsSerialized,
  isFieldGroupSerialized,
} from "@antelopejs/interface-dms/base/form";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view";
import { inviteSettingDataAPI } from "../../../../pages/settings/users/invites";
import { memberInviteForm } from "../../../../pages/settings/users/member-invite-form";

const RETIRED_OPTION = "skipEmailValidation";

function inviteFormOptions(): FormPropsSerialized {
  return memberInviteForm.serializeSync()
    .options as unknown as FormPropsSerialized;
}

function inviteFormFields(): FormFieldSerialized[] {
  return inviteFormOptions().fields.flatMap((item) =>
    isFieldGroupSerialized(item) ? item.fields : [item],
  );
}

/**
 * A signup through an invitation always validates the address, so neither
 * the invite modal nor the invitation's edit form offers to skip it.
 */
describe("[unit] pages/settings/users — invitation email validation option", () => {
  it("leaves the option out of the invite form", () => {
    const fieldIds = inviteFormFields().map((field) => field.id);

    expect(fieldIds).to.not.include(RETIRED_OPTION);
  });

  it("keeps the name optional, with no rule making it required", () => {
    const name = inviteFormFields().find((field) => field.id === "name");

    expect(name, "the invite form has a name field").to.exist;
    expect(name?.required).to.equal(false);
    expect(JSON.stringify(inviteFormOptions())).to.not.include(RETIRED_OPTION);
  });

  it("leaves the option out of the invitations table and its edit form", () => {
    const columns = GetMetadata(inviteSettingDataAPI, TableViewMeta).columns;

    expect(columns).to.not.have.property(RETIRED_OPTION);
  });
});
