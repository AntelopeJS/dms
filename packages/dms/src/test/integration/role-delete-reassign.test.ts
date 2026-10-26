import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  RoleModel,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db/models";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { listUserInvitesByEmail, seedUserInvite } from "../helpers/fixtures";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import type { prepareRoleDeletion } from "../../pages/settings/users/role-editor-store";

const ROLES = pageRoutePath("/settings/workspace/roles");
const ROLES_TABLE = "/api/tables/roles";
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_CONFLICT = 409;
const PENDING_EMAIL = "pending-reassign@test.local";

describe("[integration] role delete with reassignment", () => {
  let client: AxiosInstance;
  let editors: string;
  let readers: string;

  async function createRole(name: string): Promise<string> {
    const response = await client.post<{ id: string }>(`${ROLES}/create`, {
      name,
    });
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    return response.data.id;
  }

  const deleteRole = (
    roleId: string,
    answer?: Parameters<typeof prepareRoleDeletion>[2],
  ) =>
    client.delete(`${ROLES_TABLE}/delete`, {
      params: { id: roleId },
      data: answer,
    });

  const rolesOf = async (userId: string) =>
    (await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).getByUser(userId))
      ?.roleIds;

  before(async () => {
    await resetDatabase();
    const owner = await registerUser({ owner: true });
    client = authorizedClient(owner.accessToken);
    editors = await createRole("Editors");
    readers = await createRole("Readers");
  });

  it("moves the members and invitations of a deleted role to the one picked", async () => {
    const member = await registerUser({ roles_ids: [editors] });
    const holdsBoth = await registerUser({ roles_ids: [editors, readers] });
    await seedUserInvite({ email: PENDING_EMAIL, roles_ids: [editors] });

    const unanswered = await deleteRole(editors);
    expect(unanswered.status).to.equal(HTTP_CONFLICT);
    const ontoItself = await deleteRole(editors, { reassignTo: editors });
    expect(ontoItself.status).to.equal(HTTP_CONFLICT);
    expect(ontoItself.data).to.include({ field: "reassignTo" });

    const deleted = await deleteRole(editors, { reassignTo: readers });
    expect(deleted.status, JSON.stringify(deleted.data)).to.be.oneOf([
      HTTP_OK,
      HTTP_NO_CONTENT,
    ]);

    expect(await rolesOf(member.userId)).to.deep.equal([readers]);
    expect(await rolesOf(holdsBoth.userId)).to.deep.equal([readers]);
    const [invite] = await listUserInvitesByEmail(PENDING_EMAIL);
    expect(invite?.roles_ids).to.deep.equal([readers]);
    expect(await GetModel(RoleModel, DEFAULT_TENANT_ID).get(editors)).to.equal(
      undefined,
    );
  });

  it("takes the role away from its holders when none is picked", async () => {
    const member = await registerUser({ roles_ids: [readers] });
    const deleted = await deleteRole(readers, { reassignTo: null });
    expect(deleted.status, JSON.stringify(deleted.data)).to.be.oneOf([
      HTTP_OK,
      HTTP_NO_CONTENT,
    ]);
    expect(await rolesOf(member.userId)).to.deep.equal([]);
  });
});
