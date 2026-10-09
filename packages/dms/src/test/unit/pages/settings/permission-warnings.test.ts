import { expect } from "chai";
import type { Action } from "@antelopejs/interface-dms/component";
import {
  applyPermissionWarnings,
  applyRoleWarnings,
  declarePermissionWarning,
  resolvePermissionWarnings,
} from "../../../../pages/settings/users/permission-warnings";

const WARNING = "$test.warning.owner_level";

function action(permissionId: string | undefined): Action {
  return { permissionId } as Action;
}

describe("[unit] pages/settings/users/permission-warnings", () => {
  it("resolves a declared warning by the action's permission id", () => {
    declarePermissionWarning(action("test.warnings.table.edit"), WARNING);

    expect(
      resolvePermissionWarnings().get("test.warnings.table.edit"),
    ).to.equal(WARNING);
  });

  it("leaves out an action whose page has not registered yet", () => {
    declarePermissionWarning(action(undefined), WARNING);

    expect(resolvePermissionWarnings().has("undefined")).to.equal(false);
  });

  it("puts the warning on its node, every level down", () => {
    const tree = applyPermissionWarnings(
      [
        {
          id: "members",
          label: "Members",
          children: [{ id: "members.edit", label: "Edit" }],
        },
      ],
      new Map([["members.edit", WARNING]]),
    );

    expect(tree[0].warning).to.equal(undefined);
    expect(tree[0].children?.[0].warning).to.equal(WARNING);
  });

  it("gives a role option the distinct warnings of what it grants", () => {
    const warnings = new Map([
      ["members.edit", WARNING],
      ["members.add", WARNING],
    ]);
    const { roles } = applyRoleWarnings(
      {
        roles: [
          {
            _id: "admins",
            name: "Admins",
            permissionIds: ["members.edit", "members.add"],
          },
          { _id: "readers", name: "Readers", permissionIds: ["members"] },
        ],
        totalPermissions: 3,
      },
      warnings,
    );

    expect(roles[0].warnings).to.deep.equal([WARNING]);
    expect(roles[1]).to.not.have.property("warnings");
  });
});
