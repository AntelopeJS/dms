import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel } from "@antelopejs/interface-dms/db";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import type { InviteRoleOptions } from "../../pages/settings/users/member-role-options";
import type { RoleEditorPermissionNode } from "../../pages/settings/users/role-editor";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

// Managing members, invitations or roles lets the holder make themselves an
// owner. That is intended, so the roles editor and the role pickers warn
// about it, from the warnings the pages declare on those permissions.

const EDITOR_TREE = "/settings/workspace/roles/editor-tree";
const MEMBER_ROLE_OPTIONS = "/settings/workspace/members/role-options";
const WARNINGS = "$page.settings.roles.warning";
const HTTP_OK = 200;

const EXPECTED_WARNINGS: Record<string, string> = {
  "settings.workspace.members.table.edit": `${WARNINGS}.members`,
  "settings.workspace.members.table.add": `${WARNINGS}.invites`,
  "settings.workspace.invites.table.edit": `${WARNINGS}.invites`,
  "settings.workspace.roles.table.edit": `${WARNINGS}.roles`,
  "settings.workspace.roles.table.add": `${WARNINGS}.roles_add`,
  "settings.workspace.roles.table.delete": `${WARNINGS}.roles_delete`,
};

function warningsById(
  nodes: RoleEditorPermissionNode[],
  found = new Map<string, string>(),
): Map<string, string> {
  for (const node of nodes) {
    if (node.warning) found.set(node.id, node.warning);
    warningsById(node.children ?? [], found);
  }
  return found;
}

describe("[integration] owner-level permission warnings", () => {
  let owner: AxiosInstance;

  beforeEach(async () => {
    await resetDatabase();
    owner = authorizedClient((await registerUser({ owner: true })).accessToken);
  });

  it("carries the declared warnings on the editor tree, and only them", async () => {
    const response = await owner.get<RoleEditorPermissionNode[]>(EDITOR_TREE);
    expect(response.status).to.equal(HTTP_OK);

    expect(Object.fromEntries(warningsById(response.data))).to.deep.equal(
      EXPECTED_WARNINGS,
    );
  });

  it("repeats them on the roles that grant such a permission", async () => {
    const roles = GetModel(RoleModel, DEFAULT_TENANT_ID);
    const [roleEditors] = await roles.insert({
      name: "Role editors",
      permissions: [
        "settings",
        "settings.workspace",
        "settings.workspace.roles",
        "settings.workspace.roles.table",
        "settings.workspace.roles.table.edit",
      ],
    });
    const [readers] = await roles.insert({
      name: "Readers",
      permissions: [
        "settings",
        "settings.workspace",
        "settings.workspace.roles",
        "settings.workspace.roles.table",
        "settings.workspace.roles.table.list",
      ],
    });

    const response = await owner.get<InviteRoleOptions>(MEMBER_ROLE_OPTIONS);
    expect(response.status).to.equal(HTTP_OK);

    const byId = new Map(response.data.roles.map((role) => [role._id, role]));
    expect(byId.get(roleEditors)?.warnings).to.deep.equal([
      `${WARNINGS}.roles`,
    ]);
    expect(byId.get(readers)?.warnings).to.equal(undefined);
  });
});
