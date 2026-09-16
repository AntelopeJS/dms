import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";

export type PermissionsResolverFn = (
  userId: string,
  tenantId: string,
  currentPermissions: Set<string>,
) => Promise<Set<string>> | Set<string>;

export interface PermissionsResolverInfo {
  id: string;
  resolver: PermissionsResolverFn;
  order: number;
}

export namespace internal {
  export const RegisterPermissionsResolver = new RegisteringProxy<
    (info: PermissionsResolverInfo) => void
  >();
}

/**
 * Register a permissions resolver that transforms a user's base permission
 * set into their effective permission set.
 *
 * Semantics:
 * - Resolvers run in ascending `order`; resolvers with the same `order` run
 *   in registration order (i.e. module load order).
 * - A resolver that throws aborts the permission computation and fails the
 *   request (fail-closed); it is never silently skipped.
 * - The registration is automatically removed when the registering module is
 *   unloaded.
 * - Call during your module's `construct()` so the resolver is active before
 *   the API starts serving requests.
 *
 * Resolvers are for granular permission shaping (e.g. intersecting with a
 * subscription plan). To deny a tenant access to the product entirely, use
 * `RegisterTenantAccessGate` from `dms/tenant-access` instead.
 */
export function RegisterPermissionsResolver(
  info: PermissionsResolverInfo,
): void {
  internal.RegisterPermissionsResolver.register(info);
}

/**
 * Run the registered resolvers over a base permission set and return the
 * effective set. Prefer `GetEffectiveUserPermissions` from `dms/permissions`,
 * which composes the base set computation with this pipeline.
 */
export const ApplyPermissionsResolvers =
  InterfaceFunction<
    (
      userId: string,
      tenantId: string,
      basePermissions: Set<string>,
    ) => Promise<Set<string>>
  >();
