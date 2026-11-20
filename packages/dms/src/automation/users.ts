import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  type TenantMember,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import type {
  ActionType,
  JsonSchema,
} from "@antelopejs/interface-dms-automation";
import {
  actionTenantId,
  asStep,
  requireTenant,
  tenantExists,
} from "./action-support";
import { fieldHint, nodeText, titledProperties } from "./i18n";

export const GET_USER_ACTION_ID = "dms.get-user";
const GET_USER_TEXTS = "actions.getUser";

const STRING: JsonSchema = { type: "string" };
const BOOLEAN: JsonSchema = { type: "boolean" };
const STRINGS: JsonSchema = { type: "array", items: { type: "string" } };

interface GetUserInput {
  userId?: string;
  email?: string;
  tenantId?: string;
}

type GetUserOutput = {
  found: boolean;
  userId?: string;
  email?: string;
  name?: string;
  language?: string;
  timeZone?: string;
  isValidated?: boolean;
  isPlatformOwner?: boolean;
  createdAt?: string;
  lastActiveAt?: string;
  isMember?: boolean;
  isTenantOwner?: boolean;
  roleIds?: string[];
};

function isoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function findUser(input: GetUserInput): Promise<User | undefined> {
  const users = GetModel(UserModel);
  const userId = input.userId?.trim();
  if (userId) return users.get(userId);
  const email = input.email?.trim();
  if (email) return users.getByEmail(email);
  throw new Error(`${GET_USER_ACTION_ID} requires userId or email`);
}

async function membershipIn(
  tenantId: string,
  userId: string,
): Promise<TenantMember | undefined> {
  if (!(await tenantExists(tenantId))) return undefined;
  return GetModel(TenantMemberModel, tenantId).getByUser(userId);
}

async function getUser(input: GetUserInput): Promise<GetUserOutput> {
  const user = await findUser(input);
  if (!user) return { found: false };
  const member = await membershipIn(actionTenantId(input.tenantId), user._id);
  const output: GetUserOutput = {
    found: true,
    userId: user._id,
    email: user.email,
    name: user.name,
    language: user.language,
    isValidated: user.isValidated === true,
    isPlatformOwner: user.owner === true,
    isMember: Boolean(member),
    isTenantOwner: member?.isTenantOwner === true,
    roleIds: [...(member?.roleIds ?? [])],
  };
  if (user.timeZone) output.timeZone = user.timeZone;
  const createdAt = isoDate(user.createdAt);
  if (createdAt) output.createdAt = createdAt;
  const lastActiveAt = isoDate(user.lastActiveAt);
  if (lastActiveAt) output.lastActiveAt = lastActiveAt;
  return output;
}

const getUserAction: ActionType<GetUserInput, GetUserOutput> = {
  id: GET_USER_ACTION_ID,
  name: nodeText(GET_USER_TEXTS, "name"),
  description: nodeText(GET_USER_TEXTS, "description"),
  icon: "i-ph-user",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: titledProperties({
      userId: {
        type: "string",
        maxLength: 128,
        description: fieldHint(GET_USER_TEXTS, "userId"),
      },
      email: {
        type: "string",
        maxLength: 320,
        description: fieldHint(GET_USER_TEXTS, "email"),
      },
      tenantId: {
        type: "string",
        maxLength: 128,
        description: fieldHint(GET_USER_TEXTS, "tenantId"),
      },
    }),
    anyOf: [{ required: ["userId"] }, { required: ["email"] }],
  },
  outputSchema: {
    type: "object",
    properties: titledProperties({
      found: BOOLEAN,
      userId: STRING,
      email: STRING,
      name: STRING,
      language: STRING,
      timeZone: STRING,
      isValidated: BOOLEAN,
      isPlatformOwner: BOOLEAN,
      createdAt: STRING,
      lastActiveAt: STRING,
      isMember: BOOLEAN,
      isTenantOwner: BOOLEAN,
      roleIds: STRINGS,
    }),
    required: ["found"],
  },
  async execute(input) {
    return asStep(GET_USER_ACTION_ID, () => getUser(input));
  },
};

export const LIST_MEMBERS_ACTION_ID = "dms.list-members";
const LIST_MEMBERS_TEXTS = "actions.listMembers";
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_ROLE_FILTER = 50;

interface ListMembersInput {
  tenantId?: string;
  roleIds?: string[];
  ownersOnly?: boolean;
  limit?: number;
  offset?: number;
}

type ListedMember = {
  userId: string;
  email: string;
  name: string;
  language: string;
  roleIds: string[];
  isTenantOwner: boolean;
  joinedAt: string;
};

type ListMembersOutput = {
  members: ListedMember[];
  total: number;
  hasMore: boolean;
};

function pageBound(value: number | undefined, fallback: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 0), max);
}

async function matchingMembers(
  tenantId: string,
  input: ListMembersInput,
): Promise<TenantMember[]> {
  const roleIds = [...new Set(input.roleIds ?? [])].slice(0, MAX_ROLE_FILTER);
  const ownersOnly = input.ownersOnly === true;
  const model = GetModel(TenantMemberModel, tenantId);
  const query =
    roleIds.length === 0 && !ownersOnly
      ? model.table
      : model.table.filter((row) => {
          const isOwner = row.key("isTenantOwner").eq(true);
          const [first, ...rest] = roleIds.map((roleId) =>
            row.key("roleIds", []).includes(roleId),
          );
          if (!first) return isOwner;
          const holdsRole = rest.reduce((left, right) => left.or(right), first);
          return ownersOnly ? isOwner.and(holdsRole) : holdsRole;
        });
  const rows = await query.run();
  return rows
    .flatMap((row) => TenantMemberModel.fromDatabase(row) ?? [])
    .sort(
      (left, right) =>
        new Date(left.joinedAt).getTime() -
          new Date(right.joinedAt).getTime() ||
        left._id.localeCompare(right._id),
    );
}

async function listMembers(
  input: ListMembersInput,
): Promise<ListMembersOutput> {
  const tenantId = actionTenantId(input.tenantId);
  await requireTenant(LIST_MEMBERS_ACTION_ID, tenantId);
  const limit = Math.max(
    pageBound(input.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    1,
  );
  const offset = pageBound(input.offset, 0, Number.MAX_SAFE_INTEGER);
  const members = await matchingMembers(tenantId, input);
  const page = members.slice(offset, offset + limit);
  const users = page.length
    ? await GetModel(UserModel).getBy(
        "_id",
        ...page.map((member) => member.userId),
      )
    : [];
  const usersById = new Map(users.map((user) => [user._id, user]));
  return {
    members: page.map((member) => {
      const user = usersById.get(member.userId);
      return {
        userId: member.userId,
        email: user?.email ?? "",
        name: user?.name ?? "",
        language: user?.language ?? "",
        roleIds: [...(member.roleIds ?? [])],
        isTenantOwner: member.isTenantOwner === true,
        joinedAt: isoDate(member.joinedAt) ?? "",
      };
    }),
    total: members.length,
    hasMore: offset + page.length < members.length,
  };
}

const listMembersAction: ActionType<ListMembersInput, ListMembersOutput> = {
  id: LIST_MEMBERS_ACTION_ID,
  name: nodeText(LIST_MEMBERS_TEXTS, "name"),
  description: nodeText(LIST_MEMBERS_TEXTS, "description"),
  icon: "i-ph-users-three",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: titledProperties({
      tenantId: {
        type: "string",
        maxLength: 128,
        description: fieldHint(LIST_MEMBERS_TEXTS, "tenantId"),
      },
      roleIds: {
        ...STRINGS,
        maxItems: MAX_ROLE_FILTER,
        default: [],
        description: fieldHint(LIST_MEMBERS_TEXTS, "roleIds"),
      },
      ownersOnly: { type: "boolean", default: false },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: MAX_PAGE_SIZE,
        default: DEFAULT_PAGE_SIZE,
      },
      offset: { type: "integer", minimum: 0, default: 0 },
    }),
  },
  outputSchema: {
    type: "object",
    properties: titledProperties({
      members: {
        type: "array",
        items: {
          type: "object",
          properties: {
            userId: STRING,
            email: STRING,
            name: STRING,
            language: STRING,
            roleIds: STRINGS,
            isTenantOwner: BOOLEAN,
            joinedAt: STRING,
          },
        },
      },
      total: { type: "integer" },
      hasMore: BOOLEAN,
    }),
    required: ["members", "total", "hasMore"],
  },
  async execute(input) {
    return asStep(LIST_MEMBERS_ACTION_ID, () => listMembers(input));
  },
};

export const USER_ACTIONS = [getUserAction, listMembersAction];
