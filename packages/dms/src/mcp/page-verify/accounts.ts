import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { createSession } from "@antelopejs/interface-dms/auth";
import {
  SessionModel,
  type User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import {
  type Role,
  RoleModel,
  type TenantMember,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import type { PageInfo } from "@antelopejs/interface-dms/page";
import { ApplyPermissionsResolvers } from "@antelopejs/interface-dms/permissions-resolver";
import { SESSION_HANDOFF_ENDPOINT } from "../../config/session-handoff";
import { generateSessionHandoffToken } from "../../implementations/dms-auth/services";
import { permissionsOpenPage } from "../../utils";
import type { VerifyAccountSummary } from "./report";

const SESSION_USER_AGENT = "DMS page_verify (headless Chromium)";
const SESSION_ADDRESS = "127.0.0.1";
const OWNER_ROLE = "owner";

/** What picking a member to sign in as reads of a membership. */
export type MemberRoles = Pick<
  TenantMember,
  "userId" | "roleIds" | "isTenantOwner"
>;

/** Who a browser context signs in as. */
export interface VerifyAccount {
  user: User;
  tenantId: string;
  summary: VerifyAccountSummary;
}

/** The workspace a run checks: its roles, and a member for each role that has one. */
export interface Workspace {
  tenantId: string;
  owner: User;
  roles: Role[];
  /** A member holding only the role, by role id, for each role that has one. */
  memberByRole: Map<string, MemberRoles>;
}

/** What the browser posts to `/auth/establish` to open a session. */
export interface SessionTicket {
  endpoint: string;
  payload: { token: string };
}

/** A session opened for a run, removed with {@link closeSession}. */
export interface OpenedSession {
  sessionId: string;
  ticket: SessionTicket;
}

async function findOwner(): Promise<User> {
  const [owner] = await GetModel(UserModel).getOwners();
  if (owner === undefined) {
    throw new Error(
      "No platform owner exists yet: finish onboarding in the dashboard first.",
    );
  }
  return owner;
}

async function ownerTenantId(owner: User): Promise<string> {
  const oldest = await GetModel(
    TenantMemberModel,
    CROSS_INSTANCE,
  ).getOldestByUser(owner._id);
  if (oldest === undefined) {
    throw new Error(
      `The platform owner ${owner.email} belongs to no workspace, so no page can be opened as them.`,
    );
  }
  return oldest.tenantId;
}

/**
 * A member holding `roleId` and nothing more: any other role, or owning the
 * workspace or the platform, could open what the role alone does not.
 */
export function pickMember(
  members: readonly MemberRoles[],
  roleId: string,
  ownerIds: ReadonlySet<string>,
): MemberRoles | undefined {
  return members.find(
    (member) =>
      member.roleIds.length === 1 &&
      member.roleIds[0] === roleId &&
      !member.isTenantOwner &&
      !ownerIds.has(member.userId),
  );
}

/** The owner's workspace, its roles, and a member to sign in as for each role. */
export async function loadWorkspace(): Promise<Workspace> {
  const owner = await findOwner();
  const tenantId = await ownerTenantId(owner);
  const [roles, members, owners] = await Promise.all([
    GetModel(RoleModel, tenantId).getAll(),
    GetModel(TenantMemberModel, tenantId).listAll(),
    GetModel(UserModel).getOwners(),
  ]);
  const ownerIds = new Set(owners.map((user) => user._id));
  const memberByRole = new Map<string, MemberRoles>();
  for (const role of roles) {
    const member = pickMember(members, role._id, ownerIds);
    if (member !== undefined) memberByRole.set(role._id, member);
  }
  return { tenantId, owner, roles, memberByRole };
}

/** The role named `name` (case-insensitive) or with that id. */
export function findRole(workspace: Workspace, name: string): Role | undefined {
  const wanted = name.toLowerCase();
  return workspace.roles.find(
    (role) => role._id === name || role.name.toLowerCase() === wanted,
  );
}

/** Whether `role` names the platform owner rather than a workspace role. */
export function isOwnerRole(role: string | undefined): boolean {
  return role === undefined || role.toLowerCase() === OWNER_ROLE;
}

/** The owner's account. */
export function ownerAccount(workspace: Workspace): VerifyAccount {
  return {
    user: workspace.owner,
    tenantId: workspace.tenantId,
    summary: { kind: "owner", email: workspace.owner.email },
  };
}

/** The account of the member picked for `role`, when one holds it. */
export async function memberAccount(
  workspace: Workspace,
  role: Role,
): Promise<VerifyAccount | undefined> {
  const member = workspace.memberByRole.get(role._id);
  if (member === undefined) return undefined;
  const user = await GetModel(UserModel).get(member.userId);
  if (user === undefined) return undefined;
  return {
    user,
    tenantId: workspace.tenantId,
    summary: { kind: "member", email: user.email, role: role.name },
  };
}

/**
 * Whether a member holding only `role` opens the page: the role's grants
 * through the registered resolvers, as a role preview computes them, then
 * the rule the page guard applies.
 */
export async function roleOpensPage(
  workspace: Workspace,
  role: Role,
  info: PageInfo,
): Promise<boolean> {
  const rolePermissions = new Set(role.permissions);
  const permissions = await ApplyPermissionsResolvers(
    workspace.owner._id,
    workspace.tenantId,
    rolePermissions,
    { preview: { rolePermissions } },
  );
  return permissionsOpenPage(info, { permissions, isOwner: false });
}

/**
 * Opens a session for the account, ready for the browser to take over: the
 * handoff token sits in the session's refresh slot, so the frontend server's
 * `/auth/establish` trades it once for the session's token pair, as it does
 * after a password change.
 */
export async function openSession(
  account: VerifyAccount,
): Promise<OpenedSession> {
  const sessionModel = GetModel(SessionModel);
  const sessionId = await createSession(
    sessionModel,
    account.user._id,
    SESSION_USER_AGENT,
    SESSION_ADDRESS,
  );
  const token = generateSessionHandoffToken(
    account.user,
    account.tenantId,
    sessionId,
  );
  await sessionModel.replaceRefreshToken(sessionId, token);
  return {
    sessionId,
    ticket: { endpoint: SESSION_HANDOFF_ENDPOINT, payload: { token } },
  };
}

/** Signs a run's session out: its tokens stop working at once. */
export async function closeSession(session: OpenedSession): Promise<void> {
  await GetModel(SessionModel).delete(session.sessionId);
}
