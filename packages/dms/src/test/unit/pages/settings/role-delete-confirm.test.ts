import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  deleteRole,
  loadRoleDeleteConfirm,
  REASSIGN_FIELD,
} from "../../../../pages/settings/users/role-editor-store";

const TENANT = "role-delete-confirm-tenant";
const HTTP_CONFLICT = 409;

describe("[unit] pages/settings/users roles delete dialog", () => {
  let heldRole: string;
  let freeRole: string;

  before(async () => {
    const roles = GetModel(RoleModel, TENANT);
    [heldRole] = (await roles.insert({ name: "Editors", permissions: [] })) as [
      string,
    ];
    [freeRole] = (await roles.insert({ name: "Readers", permissions: [] })) as [
      string,
    ];
    await GetModel(TenantMemberModel, TENANT).insert({
      _id: "role-delete-confirm-member",
      userId: "role-delete-confirm-user",
      roleIds: [heldRole],
      isTenantOwner: false,
      joinedAt: new Date(),
      invitedBy: null,
    });
  });

  it("words the deletion of a held role and offers the roles to move its holders to", async () => {
    const dialog = await loadRoleDeleteConfirm(TENANT, heldRole);

    expect(dialog).to.deep.include({
      title: "$page.settings.roles.editor.delete_title",
      description: "$page.settings.roles.editor.delete_in_use",
      params: { name: "Editors", count: 1 },
      color: "error",
    });
    const [field] = dialog.fields ?? [];
    expect(field?.id).to.equal(REASSIGN_FIELD);
    expect(field?.type).to.equal("select");
    expect(field?.component.options).to.deep.include({
      items: [{ value: freeRole, label: "Readers" }],
      deselectable: true,
    });
  });

  it("asks nothing more for a role nobody holds", async () => {
    const dialog = await loadRoleDeleteConfirm(TENANT, freeRole);

    expect(dialog.description).to.equal(
      "$page.settings.roles.editor.delete_unused",
    );
    expect(dialog.fields).to.equal(undefined);
  });

  it("refuses to move the holders to the deleted role, naming the field", async () => {
    try {
      await deleteRole(
        { tenantId: TENANT, permissions: new Set(["*"]) },
        heldRole,
        { force: true, reassignTo: heldRole },
      );
      expect.fail("Expected the deletion to be refused");
    } catch (error) {
      expect(error).to.be.instanceOf(HTTPResult);
      expect((error as HTTPResult).getStatus()).to.equal(HTTP_CONFLICT);
      expect(JSON.parse(String((error as HTTPResult).getBody()))).to.deep.equal(
        {
          field: REASSIGN_FIELD,
          message: "$page.settings.roles.error.invalid_reassign",
        },
      );
    }
  });
});
