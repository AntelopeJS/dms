import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantMemberModel, TenantModel } from "@antelopejs/interface-dms/db";
import { observeTenantLifecycle } from "@antelopejs/interface-dms/tenant-lifecycle";
import type { ActionType } from "@antelopejs/interface-dms-automation";
import { actionTenantId, asStep } from "./action-support";
import { fieldHint, nodeText, titledProperties } from "./i18n";

export const GET_TENANT_ACTION_ID = "dms.get-tenant";
const GET_TENANT_TEXTS = "actions.getTenant";

interface GetTenantInput {
  tenantId?: string;
}

type GetTenantOutput = {
  found: boolean;
  tenantId?: string;
  name?: string;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
  memberCount?: number;
  ownerUserId?: string;
  ownerUserIds?: string[];
  closed?: boolean;
  provisioningPending?: boolean;
};

function isoDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function getTenant(input: GetTenantInput): Promise<GetTenantOutput> {
  const tenantId = actionTenantId(input.tenantId);
  const tenant = await GetModel(TenantModel).get(tenantId);
  if (!tenant) return { found: false };
  const members = GetModel(TenantMemberModel, tenantId);
  const owners = (await members.listOwners()).sort(
    (left, right) =>
      new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime(),
  );
  const ownerUserIds = owners.map((owner) => owner.userId);
  const lifecycle = await observeTenantLifecycle(tenantId);
  const output: GetTenantOutput = {
    found: true,
    tenantId,
    name: tenant.name,
    isDefault: tenantId === DEFAULT_TENANT_ID,
    memberCount: await members.table.count().run(),
    ownerUserIds,
    closed: lifecycle.closed,
    provisioningPending: tenant.provisioningPending === true,
  };
  const [ownerUserId] = ownerUserIds;
  if (ownerUserId) output.ownerUserId = ownerUserId;
  const createdAt = isoDate(tenant.createdAt);
  if (createdAt) output.createdAt = createdAt;
  const updatedAt = isoDate(tenant.updatedAt);
  if (updatedAt) output.updatedAt = updatedAt;
  return output;
}

const getTenantAction: ActionType<GetTenantInput, GetTenantOutput> = {
  id: GET_TENANT_ACTION_ID,
  name: nodeText(GET_TENANT_TEXTS, "name"),
  description: nodeText(GET_TENANT_TEXTS, "description"),
  icon: "i-ph-buildings",
  sideEffects: false,
  inputSchema: {
    type: "object",
    properties: titledProperties({
      tenantId: {
        type: "string",
        maxLength: 128,
        description: fieldHint(GET_TENANT_TEXTS, "tenantId"),
      },
    }),
  },
  outputSchema: {
    type: "object",
    properties: titledProperties({
      found: { type: "boolean" },
      tenantId: { type: "string" },
      name: { type: "string" },
      isDefault: { type: "boolean" },
      createdAt: { type: "string" },
      updatedAt: { type: "string" },
      memberCount: { type: "integer" },
      ownerUserId: { type: "string" },
      ownerUserIds: { type: "array", items: { type: "string" } },
      closed: { type: "boolean" },
      provisioningPending: { type: "boolean" },
    }),
    required: ["found"],
  },
  async execute(input) {
    return asStep(GET_TENANT_ACTION_ID, () => getTenant(input));
  },
};

export const TENANT_ACTIONS = [getTenantAction];
