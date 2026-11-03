import { GetMetadata } from "@antelopejs/interface-core";
import { expect } from "chai";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view";
import { memberSettingDataAPI } from "@antelopejs/interface-dms/data-controllers";
import { withMemberRolePicker } from "../../../../pages/members";
import type { FormFieldOrGroupSerialized } from "@antelopejs/interface-dms/base/form";
import type { EditRolePickerOptions } from "../../../../pages/members";

const plainField = (id: string) => ({
  id,
  label: id,
  type: "string",
  component: { componentName: "DmsInputText" },
});

function fieldOf(item: FormFieldOrGroupSerialized | undefined) {
  if (!item || "fields" in item) throw new Error("expected a field");
  return item;
}

function groupOf(item: FormFieldOrGroupSerialized | undefined) {
  if (!item || !("fields" in item)) throw new Error("expected a group");
  return item;
}

/**
 * The members data controller declares a plain roles relation; the members
 * page draws it with its role picker through the edit form's slot.
 */
describe("[unit] pages/settings/members — the roles field", () => {
  it("keeps the interface's roles column a plain relation", () => {
    const meta = GetMetadata(memberSettingDataAPI, TableViewMeta);
    const roles = meta
      .getFormFields("edit")
      .find((field) => "type" in field && field.id === "roleIds");

    expect(roles).to.not.equal(undefined);
    expect(
      roles && "inputComponent" in roles ? roles.inputComponent : undefined,
    ).to.equal(undefined);
  });

  it("draws the roles with the picker, in a group too, and nothing else", () => {
    const options = withMemberRolePicker({
      fields: [
        plainField("name"),
        { id: "access", label: "Access", fields: [plainField("roleIds")] },
      ],
    });
    const name = fieldOf(options.fields[0]);
    const roles = fieldOf(groupOf(options.fields[1]).fields[0]);

    expect(name.component).to.deep.equal({ componentName: "DmsInputText" });
    expect(roles.component).to.deep.include({
      componentName: "DmsMemberRolePicker",
    });
    // SAFETY: The roleIds field is replaced by editRolePicker, whose serialized component options include the rolesUrl and ownerField contract.
    expect(
      (roles.component as { options: EditRolePickerOptions }).options,
    ).to.include({
      rolesUrl: "/dms/pages/settings/workspace/members/role-options",
      ownerField: "isTenantOwner",
    });
  });
});
