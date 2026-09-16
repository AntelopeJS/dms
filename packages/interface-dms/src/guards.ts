import {
  type ControllerClass,
  HTTPResult,
  type RequestContext,
  SetParameterProvider,
} from "@antelopejs/interface-api";
import { CreateAuthDecorator } from "@antelopejs/interface-auth";
import { InterfaceFunction } from "@antelopejs/interface-core";
import { MakeParameterAndPropertyDecorator } from "@antelopejs/interface-core/decorators";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { Action, ComponentTargetInput } from "./component";
import { TenantMemberModel } from "./db";
import { AssertTenantAccess } from "./tenant-access";
import {
  authenticateRequestPrincipal,
  internal as authInternal,
  type RequestAuthenticator,
  type TenantTokenInput,
} from "./auth";
import type { User } from "./auth/db";

const HTTP_FORBIDDEN_STATUS = 403;
const TENANT_OWNER_REQUIRED_MESSAGE = "Tenant owner required";
const TENANT_MEMBER_REQUIRED_MESSAGE = "Tenant member required";

async function getTenantMembership(
  userId: string,
  tenantId: string,
): Promise<{ isTenantOwner: boolean } | undefined> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const membership = await memberModel.getByUser(userId);
  return membership ?? undefined;
}

/**
 * @internal
 */
export namespace internal {
  export const AuthUserWithPermissionValidator =
    InterfaceFunction<
      (
        target: ComponentTargetInput | ControllerClass | Action,
        data: TenantTokenInput,
        options?: TenantGuardOptions,
      ) => boolean | User
    >();
}

/**
 * Authentication decorator that validates both user authentication and permission
 * @param target The component, child target, or page to check permission for
 * @param options Tenant guard options, e.g. to skip the tenant access gate
 * @returns Authentication decorator
 */
export const AuthUserWithPermission = (
  target: ComponentTargetInput | ControllerClass | Action,
  options?: TenantGuardOptions,
) => {
  const decorator = CreateAuthDecorator({
    source: (req, _) => req.headers.authorization?.split(" ")[1],
    authenticator: authInternal.AuthUserAuthenticator,
    validator: (data) =>
      internal.AuthUserWithPermissionValidator(target, data, options),
  });
  return decorator();
};

export interface TenantGuardOptions {
  /**
   * Skip the tenant access gate for this route. Reserved for routes that must
   * stay reachable when a gate denies the tenant (billing status, payment
   * portal, invoices) so a blocked tenant can still regularize its situation.
   */
  bypassTenantAccessGate?: boolean;
}

/** Route-local credential policy; JWT remains the only default credential. */
export interface TenantRequestGuardOptions extends TenantGuardOptions {
  /** Additional credential families accepted by this route before the JWT fallback. */
  authenticators?: readonly RequestAuthenticator[];
  /** Require current tenant ownership, not platform ownership. */
  requireOwner?: boolean;
}

/**
 * Reauthenticate and authorize current tenant membership (and optionally ownership).
 * Suitable for long-lived requests: credentials, membership and tenant gates are checked
 * on every invocation. Product permissions remain the caller's responsibility.
 */
export async function authenticateTenantRequest(
  ctx: RequestContext,
  options: TenantRequestGuardOptions = {},
): Promise<User> {
  const { user, tenantId } = await authenticateRequestPrincipal(
    ctx,
    options.authenticators,
  );
  const membership = await getTenantMembership(user._id, tenantId);
  if (!membership || (options.requireOwner && !membership.isTenantOwner)) {
    throw new HTTPResult(
      HTTP_FORBIDDEN_STATUS,
      options.requireOwner
        ? TENANT_OWNER_REQUIRED_MESSAGE
        : TENANT_MEMBER_REQUIRED_MESSAGE,
    );
  }
  if (!options.bypassTenantAccessGate) {
    await AssertTenantAccess(user._id, tenantId);
  }
  return user;
}

/**
 * Authentication decorator that requires the authenticated user to be the
 * owner of the credential's tenant (JWT by default, or a route-local authenticator).
 * Throws 401 when no token is provided and 403 when the user is authenticated
 * but is not a tenant owner, or when a tenant access gate denies the tenant
 * (unless `bypassTenantAccessGate` is set).
 */
export const AuthTenantOwner = MakeParameterAndPropertyDecorator(
  (target, key, index, options?: TenantRequestGuardOptions) => {
    SetParameterProvider(target, key, index, async (ctx: RequestContext) => {
      return authenticateTenantRequest(ctx, { ...options, requireOwner: true });
    });
  },
);

/**
 * Authentication decorator that requires the authenticated user to be a member
 * of the credential's tenant (JWT by default, or a route-local authenticator).
 * Throws 401 when no token is provided and 403 when the user is authenticated
 * but is not a tenant member, or when a tenant access gate denies the tenant
 * (unless `bypassTenantAccessGate` is set).
 */
export const AuthTenantMember = MakeParameterAndPropertyDecorator(
  (target, key, index, options?: TenantRequestGuardOptions) => {
    SetParameterProvider(target, key, index, async (ctx: RequestContext) => {
      return authenticateTenantRequest(ctx, options);
    });
  },
);
