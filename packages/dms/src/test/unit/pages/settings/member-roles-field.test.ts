import { GetMetadata } from "@antelopejs/interface-core";
import { expect } from "chai";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view";
import { memberSettingDataAPI } from "@antelopejs/interface-dms/data-controllers";
import { withMemberRolePicker } from "../../../../pages/settings/users/member-roles-field";

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
    const [name, group] = options.fields as Array<Record<string, unknown>>;
    const [roles] = (group as { fields: Array<Record<string, unknown>> })
      .fields;

    expect(name.component).to.deep.equal({ componentName: "DmsInputText" });
    expect(roles.component).to.deep.include({
      componentName: "DmsMemberRolePicker",
    });
    expect(
      (roles.component as { options: Record<string, unknown> }).options,
    ).to.include({
      rolesUrl: "/settings/workspace/members/role-options",
      ownerField: "isTenantOwner",
    });
  });

  it("leaves options without fields as they are", () => {
    const options = { title: "Change roles" };
    expect(withMemberRolePicker(options)).to.equal(options);
  });
});
