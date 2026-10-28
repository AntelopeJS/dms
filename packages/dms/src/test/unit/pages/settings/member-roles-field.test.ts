import { GetMetadata } from "@antelopejs/interface-core";
import { expect } from "chai";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view";
import { memberSettingDataAPI } from "@antelopejs/interface-dms/data-controllers";
import { withMemberRolePicker } from "../../../../pages/members";
import type { FormFieldSerialized } from "@antelopejs/interface-dms/base/form";
import type { EditRolePickerOptions } from "../../../../pages/members";

const plainField = (id: string) => ({
  id,
  label: id,
  type: "string",
  component: { componentName: "DmsInputText" },
});

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
    // SAFETY: Only the legacy optional property is probed; optional access preserves the test's missing-field behavior without claiming a full serialized form field.
    expect(
      (roles as { inputComponent?: unknown } | undefined)?.inputComponent,
    ).to.equal(undefined);
  });

  it("draws the roles with the picker, in a group too, and nothing else", () => {
    const options = withMemberRolePicker({
      fields: [
        plainField("name"),
        { id: "access", label: "Access", fields: [plainField("roleIds")] },
      ],
    });
    // SAFETY: This fixture supplies one field and one group containing one field; withMemberRolePicker only replaces components, while SlotOptions erases the fields' shape.
    const [name, group] = options.fields as [
      FormFieldSerialized,
      { fields: FormFieldSerialized[] },
    ];
    const [roles] = group.fields;

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

  it("leaves options without fields as they are", () => {
    const options = { title: "Change roles" };
    expect(withMemberRolePicker(options)).to.equal(options);
  });
});
