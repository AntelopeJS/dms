import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  RoleModel,
  type TenantMember,
  TenantMemberModel,
  TenantModel,
} from "@antelopejs/interface-dms/db";
import {
  type Hook,
  type HookHandler,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { expect } from "chai";
import { automationLoopGuard } from "../../automation/loop-guard";
import { resetDatabase } from "./db";

export const TENANT = "automation-member-actions";
export const OTHER_TENANT = "automation-member-actions-other";
export const HTTP_PAYMENT_REQUIRED = 402;

/** Ids seeded by {@link seedMemberTenants}. */
export interface MemberTenants {
  owner: string;
  member: string;
  editor: string;
  viewer: string;
}

/** The message a failing step shows. */
export async function stepFailure(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    expect(error).to.be.instanceOf(Error);
    return String(error);
  }
  return expect.fail("expected the step to fail");
}

export async function insertUser(
  email: string,
  owner = false,
): Promise<string> {
  const [id] = await GetModel(UserModel).insert({ email, name: email, owner });
  return id;
}

export async function addMember(
  tenantId: string,
  userId: string,
  roleIds: string[],
  isTenantOwner = false,
): Promise<void> {
  await GetModel(TenantMemberModel, tenantId)
    .table.insert({ userId, roleIds, isTenantOwner, joinedAt: new Date() })
    .run();
}

export function storedMember(
  userId: string,
  tenantId = TENANT,
): Promise<TenantMember | undefined> {
  return GetModel(TenantMemberModel, tenantId).getByUser(userId);
}

/** Runs `run` with `handler` registered on `hook`. */
export async function withHook<H extends Hook>(
  hook: H,
  handler: HookHandler<H>,
  run: () => Promise<void>,
): Promise<void> {
  RegisterHook(hook, handler);
  try {
    await run();
  } finally {
    UnregisterHook(hook, handler);
  }
}

/**
 * Two tenants: an owner and a viewer member in {@link TENANT}, the same
 * member in {@link OTHER_TENANT}, and the loop guard reset.
 */
export async function seedMemberTenants(): Promise<MemberTenants> {
  await resetDatabase();
  automationLoopGuard.reset();
  await GetModel(TenantModel)
    .table.insert([
      { _id: TENANT, name: "Members" },
      { _id: OTHER_TENANT, name: "Other" },
    ])
    .run();
  const roles = GetModel(RoleModel, TENANT);
  const [editor] = await roles.insert({ name: "Editor", permissions: [] });
  const [viewer] = await roles.insert({ name: "Viewer", permissions: [] });
  const owner = await insertUser("owner@test.local");
  const member = await insertUser("member@test.local");
  await addMember(TENANT, owner, [], true);
  await addMember(TENANT, member, [viewer]);
  await addMember(OTHER_TENANT, member, ["other-role"]);
  return { owner, member, editor, viewer };
}
