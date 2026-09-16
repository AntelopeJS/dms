import type {
  TenantAccessGateInfo,
  TenantAccessResult,
} from "@antelopejs/interface-dms/tenant-access";

const gates: TenantAccessGateInfo[] = [];

export namespace internal {
  export const RegisterTenantAccessGate = {
    register: (info: TenantAccessGateInfo): void => {
      const existingIndex = gates.findIndex((g) => g.id === info.id);
      if (existingIndex >= 0) {
        gates[existingIndex] = info;
      } else {
        gates.push(info);
      }
      gates.sort((a, b) => a.order - b.order);
    },
    unregister: (info: TenantAccessGateInfo): void => {
      const index = gates.findIndex((g) => g.id === info.id);
      if (index >= 0) gates.splice(index, 1);
    },
  };
}

export async function CheckTenantAccess(
  userId: string | undefined,
  tenantId: string,
): Promise<TenantAccessResult> {
  for (const { gate } of gates) {
    const result = await gate(userId, tenantId);
    if (!result.allowed) return result;
  }
  return { allowed: true };
}
