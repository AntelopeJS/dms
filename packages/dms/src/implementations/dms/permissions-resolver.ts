import type { PermissionsResolverInfo } from "@antelopejs/interface-dms/permissions-resolver";

const resolvers: PermissionsResolverInfo[] = [];

export namespace internal {
  export const RegisterPermissionsResolver = {
    register: (info: PermissionsResolverInfo): void => {
      const existingIndex = resolvers.findIndex((r) => r.id === info.id);
      if (existingIndex >= 0) {
        resolvers[existingIndex] = info;
      } else {
        resolvers.push(info);
      }
      resolvers.sort((a, b) => a.order - b.order);
    },
    unregister: (info: PermissionsResolverInfo): void => {
      const index = resolvers.findIndex((r) => r.id === info.id);
      if (index >= 0) resolvers.splice(index, 1);
    },
  };
}

export async function ApplyPermissionsResolvers(
  userId: string,
  tenantId: string,
  basePermissions: Set<string>,
): Promise<Set<string>> {
  let current = basePermissions;
  for (const resolver of resolvers) {
    current = await resolver.resolver(userId, tenantId, current);
  }
  return current;
}
