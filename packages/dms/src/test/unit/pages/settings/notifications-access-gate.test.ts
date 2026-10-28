import {
  ControllerMeta,
  type RequestContext,
  computeParameter,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { generateAccessToken } from "../../../../implementations/dms-auth";
import { NotificationsApiController } from "../../../../pages/account";
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
const gate = denyingTenantGate("notifications-gate", DENIED_TENANT);

function context(token: string): RequestContext {
  // SAFETY: The user parameter resolver reads only rawRequest.headers.authorization from this request stub; it does not send a response or access transport state.
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

function resolveControllerUser(
  token: string,
): ReturnType<typeof computeParameter> {
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
    // SAFETY: The registered user parameter is AuthUser, which resolves the stored User inserted in this suite; computeParameter erases that decorator-specific result.
    const user = (await resolveControllerUser(memberToken)) as User;
    expect(user._id).to.equal(MEMBER_ID);
  });

  it("serves a user who is not a member of the tenant their own notifications", async () => {
    // SAFETY: The same AuthUser parameter resolves the outsider's stored User; tenant membership is not part of this controller's authentication requirement.
    const user = (await resolveControllerUser(outsiderToken)) as User;
    expect(user._id).to.equal(OUTSIDER_ID);
  });
});
