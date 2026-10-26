import { strict as assert } from "node:assert";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";

import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  Hook,
  type MemberChangeHookPayload,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import type { AxiosInstance } from "axios";

import {
  observeTenantLifecycle,
  pauseTenantLifecycleAdmission,
  resumeTenantLifecycleAdmission,
} from "@antelopejs/interface-dms/tenant-lifecycle";

import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  authorizedClient,
  type RegisteredUser,
  registerUser,
} from "../helpers/auth";
import { resetDatabase } from "../helpers/db";

export function registerTenantMembershipCases({
  HTTP_PAYMENT_REQUIRED,
  HTTP_CONFLICT,
}: {
  HTTP_PAYMENT_REQUIRED: number;
  HTTP_CONFLICT: number;
}): void {
  describe("Every membership write goes through changeTenantMembers", () => {
    const MEMBERS_API = "/api/tables/members";
    const ROLES_TABLE = "/api/tables/roles";
    const ACCOUNT_DELETION =
      "/dms/pages/settings/user/profile/account-deletion";
    const HTTP_OK = 200;
    let owner: AxiosInstance;
    let member: RegisteredUser;
    let memberRowId: string;
    let roleId: string;

    const editRoles = (roleIds: string[]) =>
      owner.put(
        `${MEMBERS_API}/edit`,
        { roleIds },
        { params: { id: memberRowId } },
      );
    const storedRoles = async () =>
      (await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).get(memberRowId))
        ?.roleIds;

    beforeEach(async () => {
      await resetDatabase();
      owner = authorizedClient(
        (await registerUser({ owner: true })).accessToken,
      );
      [roleId] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
        name: "Support",
        permissions: [],
      });
      member = await registerUser({ roles_ids: [roleId] });
      const row = await GetModel(
        TenantMemberModel,
        DEFAULT_TENANT_ID,
      ).getByUser(member.userId);
      assert.ok(row);
      memberRowId = row._id;
    });

    it("refuses role changes and an account deletion with 409 while a barrier is held, writing nothing", async () => {
      const { revision } = await observeTenantLifecycle(DEFAULT_TENANT_ID);
      assert.equal(
        await pauseTenantLifecycleAdmission(
          DEFAULT_TENANT_ID,
          "free",
          revision,
        ),
        true,
      );
      try {
        assert.equal((await editRoles([])).status, HTTP_CONFLICT);
        const roleDeleted = await owner.delete(`${ROLES_TABLE}/delete`, {
          params: { id: roleId },
          data: { reassignTo: null },
        });
        assert.equal(roleDeleted.status, HTTP_CONFLICT);
        assert.ok(await GetModel(RoleModel, DEFAULT_TENANT_ID).get(roleId));
        assert.deepEqual(await storedRoles(), [roleId]);

        const accountDeleted = await authorizedClient(member.accessToken).post(
          ACCOUNT_DELETION,
          { password: member.password, confirmation: member.email },
        );
        assert.equal(accountDeleted.status, HTTP_CONFLICT);
        assert.ok(await GetModel(UserModel).get(member.userId));
        assert.ok(
          await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).get(memberRowId),
        );
        assert.deepEqual(
          (await observeTenantLifecycle(DEFAULT_TENANT_ID)).activeAttemptIds,
          [],
        );
      } finally {
        await resumeTenantLifecycleAdmission(DEFAULT_TENANT_ID, "free");
      }
      assert.equal((await editRoles([])).status, HTTP_OK);
      assert.deepEqual(await storedRoles(), []);
    });

    it("lets the policy hook veto a role change, announced as such", async () => {
      const announced: MemberChangeHookPayload[] = [];
      const veto = (payload: MemberChangeHookPayload) => {
        announced.push(payload);
        throw new HTTPResult(HTTP_PAYMENT_REQUIRED, "no role changes");
      };
      RegisterHook(Hook.MEMBER_BEING_CHANGED, veto);
      try {
        assert.equal((await editRoles([])).status, HTTP_PAYMENT_REQUIRED);
      } finally {
        UnregisterHook(Hook.MEMBER_BEING_CHANGED, veto);
      }
      assert.deepEqual(await storedRoles(), [roleId]);
      assert.deepEqual(JSON.parse(JSON.stringify(announced)), [
        {
          tenantId: DEFAULT_TENANT_ID,
          kind: "roles",
          userId: member.userId,
          roleIds: [],
          previousRoleIds: [roleId],
        },
      ]);
      assert.deepEqual(
        (await observeTenantLifecycle(DEFAULT_TENANT_ID)).activeAttemptIds,
        [],
      );
    });
  });
}
