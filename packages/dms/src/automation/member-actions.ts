import type {
  ActionType,
  ExecutionCtx,
} from "@antelopejs/interface-dms-automation";
import {
  type MemberRolesMode,
  type MemberRolesResult,
  type MemberRemovalResult,
  previewMemberRemoval,
  previewMemberRoles,
  removeTenantMember,
  setMemberRoles,
} from "../pages/settings/users/member-management";
import {
  cancelInviteIfPending,
  type InviteCancellation,
  previewInviteCancellation,
} from "../pages/settings/users/invite-cancel";
import { actionTenantId, asStep, requireTenant } from "./action-support";
import { fieldHint, nodeText, titledProperties } from "./i18n";
import { runAsAutomation } from "./origin";

const STRINGS = { type: "array", items: { type: "string" } } as const;
const TENANT_ID_INPUT = { type: "string", maxLength: 128 } as const;

/** Checks the tenant, then runs the write as the procedure step's own. */
async function automationWrite<T>(
  actionId: string,
  tenantId: string,
  ctx: ExecutionCtx,
  write: () => Promise<T>,
): Promise<T> {
  return asStep(actionId, async () => {
    await requireTenant(actionId, tenantId);
    return runAsAutomation(ctx, write);
  });
}

async function automationPreview<T>(
  actionId: string,
  tenantId: string,
  preview: () => Promise<T>,
): Promise<T> {
  return asStep(actionId, async () => {
    await requireTenant(actionId, tenantId);
    return preview();
  });
}

export const SET_MEMBER_ROLES_ACTION_ID = "dms.set-member-roles";
const SET_MEMBER_ROLES_TEXTS = "actions.setMemberRoles";
const MAX_ROLES = 50;

interface SetMemberRolesInput {
  tenantId?: string;
  userId: string;
  roleIds?: string[];
  mode?: MemberRolesMode;
  isTenantOwner?: boolean;
}

function rolesRequest(input: SetMemberRolesInput) {
  return {
    roleIds: input.roleIds,
    mode: input.mode,
    isTenantOwner: input.isTenantOwner,
  };
}

const setMemberRolesAction: ActionType<SetMemberRolesInput, MemberRolesResult> =
  {
    id: SET_MEMBER_ROLES_ACTION_ID,
    name: nodeText(SET_MEMBER_ROLES_TEXTS, "name"),
    description: nodeText(SET_MEMBER_ROLES_TEXTS, "description"),
    icon: "i-ph-key",
    inputSchema: {
      type: "object",
      properties: titledProperties({
        tenantId: {
          ...TENANT_ID_INPUT,
          description: fieldHint(SET_MEMBER_ROLES_TEXTS, "tenantId"),
        },
        userId: { type: "string", maxLength: 128 },
        roleIds: {
          ...STRINGS,
          maxItems: MAX_ROLES,
          uniqueItems: true,
          description: fieldHint(SET_MEMBER_ROLES_TEXTS, "roleIds"),
        },
        mode: {
          type: "string",
          enum: ["replace", "add", "remove"],
          default: "replace",
          description: fieldHint(SET_MEMBER_ROLES_TEXTS, "mode"),
        },
        isTenantOwner: {
          type: "boolean",
          description: fieldHint(SET_MEMBER_ROLES_TEXTS, "isTenantOwner"),
        },
      }),
      required: ["userId"],
    },
    outputSchema: {
      type: "object",
      properties: titledProperties({
        changed: { type: "boolean" },
        userId: { type: "string" },
        roleIds: STRINGS,
        previousRoleIds: STRINGS,
        isTenantOwner: { type: "boolean" },
        previousIsTenantOwner: { type: "boolean" },
      }),
      required: [
        "changed",
        "userId",
        "roleIds",
        "previousRoleIds",
        "isTenantOwner",
        "previousIsTenantOwner",
      ],
    },
    async dryRun(input) {
      const tenantId = actionTenantId(input.tenantId);
      return automationPreview(SET_MEMBER_ROLES_ACTION_ID, tenantId, () =>
        previewMemberRoles(tenantId, input.userId, rolesRequest(input)),
      );
    },
    async execute(input, ctx) {
      const tenantId = actionTenantId(input.tenantId);
      return automationWrite(SET_MEMBER_ROLES_ACTION_ID, tenantId, ctx, () =>
        setMemberRoles(tenantId, input.userId, rolesRequest(input)),
      );
    },
  };

export const CANCEL_INVITE_ACTION_ID = "dms.cancel-invite";
const CANCEL_INVITE_TEXTS = "actions.cancelInvite";

interface CancelInviteInput {
  tenantId?: string;
  inviteId: string;
}

const cancelInviteAction: ActionType<CancelInviteInput, InviteCancellation> = {
  id: CANCEL_INVITE_ACTION_ID,
  name: nodeText(CANCEL_INVITE_TEXTS, "name"),
  description: nodeText(CANCEL_INVITE_TEXTS, "description"),
  icon: "i-ph-envelope-simple-x",
  inputSchema: {
    type: "object",
    properties: titledProperties({
      tenantId: {
        ...TENANT_ID_INPUT,
        description: fieldHint(CANCEL_INVITE_TEXTS, "tenantId"),
      },
      inviteId: {
        type: "string",
        maxLength: 128,
        description: fieldHint(CANCEL_INVITE_TEXTS, "inviteId"),
      },
    }),
    required: ["inviteId"],
  },
  outputSchema: {
    type: "object",
    properties: titledProperties({
      cancelled: { type: "boolean" },
      status: {
        type: "string",
        enum: ["cancelled", "already-resolved", "not-found"],
      },
      reason: {
        type: "string",
        enum: ["accepted", "cancelled", "replaced", "expired", "resent"],
      },
      email: { type: "string" },
    }),
    required: ["cancelled", "status"],
  },
  async dryRun(input) {
    const tenantId = actionTenantId(input.tenantId);
    return automationPreview(CANCEL_INVITE_ACTION_ID, tenantId, () =>
      previewInviteCancellation(tenantId, input.inviteId),
    );
  },
  async execute(input, ctx) {
    const tenantId = actionTenantId(input.tenantId);
    return automationWrite(CANCEL_INVITE_ACTION_ID, tenantId, ctx, () =>
      cancelInviteIfPending(tenantId, input.inviteId),
    );
  },
};

export const REMOVE_MEMBER_ACTION_ID = "dms.remove-member";
const REMOVE_MEMBER_TEXTS = "actions.removeMember";

interface RemoveMemberInput {
  tenantId?: string;
  userId: string;
}

const removeMemberAction: ActionType<RemoveMemberInput, MemberRemovalResult> = {
  id: REMOVE_MEMBER_ACTION_ID,
  name: nodeText(REMOVE_MEMBER_TEXTS, "name"),
  description: nodeText(REMOVE_MEMBER_TEXTS, "description"),
  icon: "i-ph-user-minus",
  inputSchema: {
    type: "object",
    properties: titledProperties({
      tenantId: {
        ...TENANT_ID_INPUT,
        description: fieldHint(REMOVE_MEMBER_TEXTS, "tenantId"),
      },
      userId: { type: "string", maxLength: 128 },
    }),
    required: ["userId"],
  },
  outputSchema: {
    type: "object",
    properties: titledProperties({
      removed: { type: "boolean" },
      userId: { type: "string" },
      wasTenantOwner: { type: "boolean" },
    }),
    required: ["removed", "userId", "wasTenantOwner"],
  },
  async dryRun(input) {
    const tenantId = actionTenantId(input.tenantId);
    return automationPreview(REMOVE_MEMBER_ACTION_ID, tenantId, () =>
      previewMemberRemoval(tenantId, input.userId),
    );
  },
  async execute(input, ctx) {
    const tenantId = actionTenantId(input.tenantId);
    return automationWrite(REMOVE_MEMBER_ACTION_ID, tenantId, ctx, () =>
      removeTenantMember(tenantId, input.userId),
    );
  },
};

export const MEMBER_ACTIONS = [
  setMemberRolesAction,
  cancelInviteAction,
  removeMemberAction,
];
