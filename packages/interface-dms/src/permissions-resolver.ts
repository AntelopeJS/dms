import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";

/**
 * A role preview a resolver call computes the set for (Settings › Roles ›
 * Preview as role), instead of a real member's.
 */
export interface PermissionsResolverPreview {
  /** The previewed role's permissions, before any resolver reshaped them. */
  rolePermissions: ReadonlySet<string>;
}

/** What a resolver call is for, besides the user and the tenant. */
export interface PermissionsResolverContext {
  /**
   * Set when the call previews a role. Its `userId` is then a synthetic
   * member of no workspace, never the viewer: a resolver keyed on the user
   * (an owner handed more, a screen kept for owners) must shape the set as
   * for an ordinary member holding only that role.
   */
  preview?: PermissionsResolverPreview;
}

/**
 * Reshape a user's permission set for a tenant. `context` is optional: a
 * runtime older than the field passes none, so read it as `context?.preview`.
 */
export type PermissionsResolverFn = (
  userId: string,
  tenantId: string,
  currentPermissions: Set<string>,
  context?: PermissionsResolverContext,
) => Promise<Set<string>> | Set<string>;

export interface PermissionsResolverInfo {
  id: string;
  resolver: PermissionsResolverFn;
  order: number;
}

/** @internal */
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
 * which composes the base set computation with this pipeline. `context` is
 * handed to every resolver, `{}` when omitted.
 */
export const ApplyPermissionsResolvers =
  InterfaceFunction<
    (
      userId: string,
      tenantId: string,
      basePermissions: Set<string>,
      context?: PermissionsResolverContext,
    ) => Promise<Set<string>>
  >();
