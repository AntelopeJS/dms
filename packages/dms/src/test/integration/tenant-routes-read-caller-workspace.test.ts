import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { z } from "zod";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { RoleModel } from "@antelopejs/interface-dms/db";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import { createUserInviteToken } from "@antelopejs/interface-dms/invites";
import { applyTenantOwnership } from "@antelopejs/interface-dms/tenant-ownership";
import { authorizedClient, parseAuthBody, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";
import { parseBody } from "../helpers/parse-body";

const WORKSPACES = ["caller-workspace-a", "caller-workspace-b"];
const HTTP_OK = 200;
const REPEATS = 5;
const INVITES_LIST = "settings.workspace.invites.table.list";

const Names = z.array(z.string());
const InviteList = z.object({
  results: z.array(z.object({ email: z.string() })),
});

/**
 * The role, the invitation and the membership that tell `tenantId` apart
 * from the default workspace, where the caller holds no role.
 */
async function seedWorkspace(tenantId: string, userId: string): Promise<void> {
  const [roleId] = await GetModel(RoleModel, tenantId).insert({
    name: `role of ${tenantId}`,
    permissions: withPermissionAncestors([INVITES_LIST]),
  });
  await applyTenantOwnership(GetModel(UserModel), userId, tenantId, {
    roleIds: [roleId],
    isTenantOwner: true,
  });
  await createUserInviteToken({
    tenantId,
    email: `invitee@${tenantId}.test`,
    language: "en",
    roleIds: [],
    asTenantOwner: false,
  });
}

/** A session switched to `tenantId`: its access token, and the refresh token it rotated to. */
async function switchTo(
  refreshToken: string,
  tenantId: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const switched = await createClient().post("/api/auth/switch-tenant", {
    refreshToken,
    tenantId,
  });
  expect(switched.status, JSON.stringify(switched.data)).to.equal(HTTP_OK);
  return parseAuthBody(switched);
}

async function read<T>(
  token: string,
  path: string,
  body: z.ZodType<T>,
): Promise<T> {
  const response = await authorizedClient(token).get(path);
  expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
  return parseBody(body, response);
}

describe("[integration] tenant routes read the caller's workspace", () => {
  const tokens = new Map<string, string>();

  before(async () => {
    await resetDatabase();
    const caller = await registerUser();
    let { refreshToken } = caller;
    await createUserInviteToken({
      tenantId: "default",
      email: "invitee@default-workspace.test",
      language: "en",
      roleIds: [],
      asTenantOwner: false,
    });
    for (const tenantId of WORKSPACES) {
      await seedWorkspace(tenantId, caller.userId);
      const session = await switchTo(refreshToken, tenantId);
      tokens.set(tenantId, session.access_token);
      refreshToken = session.refresh_token;
    }
  });

  function tokenOf(tenantId: string): string {
    const token = tokens.get(tenantId);
    if (!token) throw new Error(`No token for ${tenantId}`);
    return token;
  }

  it("a tenant-guarded route reads the roles of the caller's workspace", async () => {
    for (let run = 0; run < REPEATS; run += 1) {
      for (const tenantId of WORKSPACES) {
        const names = await read(
          tokenOf(tenantId),
          "/api/tenant-guarded-roles/names",
          Names,
        );
        expect(names).to.deep.equal([`role of ${tenantId}`]);
      }
    }
  });

  it("the invitations table lists the caller's workspace invitations", async () => {
    for (let run = 0; run < REPEATS; run += 1) {
      for (const tenantId of WORKSPACES) {
        const list = await read(
          tokenOf(tenantId),
          "/api/tables/admin-invites/list",
          InviteList,
        );
        expect(list.results.map(({ email }) => email)).to.deep.equal([
          `invitee@${tenantId}.test`,
        ]);
      }
    }
  });

  it("the permissions route answers the caller's workspace roles", async () => {
    for (const tenantId of WORKSPACES) {
      const permissions = await read(
        tokenOf(tenantId),
        "/dms/permissions",
        Names,
      );
      expect(permissions).to.include(INVITES_LIST);
    }
  });
});
