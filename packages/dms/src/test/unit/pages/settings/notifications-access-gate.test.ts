import {
  ControllerMeta,
  HTTPResult,
  type RequestContext,
  computeParameter,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { generateAccessToken } from "../../../../implementations/dms-auth";
import { NotificationsApiController } from "../../../../pages/settings/users/notifications";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  RegisterTenantAccessGate,
  internal as tenantAccessInternal,
} from "@antelopejs/interface-dms/tenant-access";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { denyingTenantGate } from "../../../helpers/page-access";

const DENIED_TENANT = "notifications-gate-tenant";
const MEMBER_ID = "notifications-gate-member";
const OUTSIDER_ID = "notifications-gate-outsider";
const AUTH_KEY = "notifications-gate-key";
const HTTP_FORBIDDEN = 403;
const gate = denyingTenantGate("notifications-gate", DENIED_TENANT);

function context(token: string): RequestContext {
  return {
    rawRequest: { headers: { authorization: `Bearer ${token}` } },
  } as RequestContext;
}

async function insertUser(id: string): Promise<User> {
  await GetModel(UserModel).insert({
    _id: id,
    email: `${id}@test.local`,
    name: id,
    authKey: AUTH_KEY,
    isValidated: true,
    language: "en",
    password: null,
  });
  const stored = await GetModel(UserModel).get(id);
  if (!stored) throw new Error(`Missing test user ${id}`);
  return stored;
}

function resolveControllerUser(token: string): Promise<unknown> {
  const meta = GetMetadata(NotificationsApiController, ControllerMeta);
  return computeParameter(
    context(token),
    meta.computed_props.user,
    new NotificationsApiController(),
  );
}

describe("[unit] pages/settings/users/notifications — tenant access gate", () => {
  let memberToken: string;
  let outsiderToken: string;

  before(async () => {
    const member = await insertUser(MEMBER_ID);
    const outsider = await insertUser(OUTSIDER_ID);
    memberToken = generateAccessToken(DENIED_TENANT, member).token;
    outsiderToken = generateAccessToken(DENIED_TENANT, outsider).token;
    await GetModel(TenantMemberModel, DENIED_TENANT).insert({
      userId: MEMBER_ID,
      roleIds: [],
      isTenantOwner: false,
      joinedAt: new Date(),
      invitedBy: null,
    });
    RegisterTenantAccessGate(gate);
  });

  after(() => {
    tenantAccessInternal.RegisterTenantAccessGate.unregister(gate);
  });

  it("serves a member's own notifications while a gate denies the tenant", async () => {
    const user = (await resolveControllerUser(memberToken)) as User;
    expect(user._id).to.equal(MEMBER_ID);
  });

  it("still refuses a user who is not a member of the tenant", async () => {
    try {
      await resolveControllerUser(outsiderToken);
      expect.fail("Expected the membership check to refuse");
    } catch (error) {
      expect(error).to.be.instanceOf(HTTPResult);
      expect((error as HTTPResult).getStatus()).to.equal(HTTP_FORBIDDEN);
    }
  });
});
