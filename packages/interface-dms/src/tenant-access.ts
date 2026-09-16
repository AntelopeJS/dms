import { HTTPResult } from "@antelopejs/interface-api";
import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";

const HTTP_FORBIDDEN_STATUS = 403;

export type TenantAccessResult =
  | { allowed: true }
  | { allowed: false; code: string };

export type TenantAccessGateFn = (
  userId: string | undefined,
  tenantId: string,
) => Promise<TenantAccessResult> | TenantAccessResult;

export interface TenantAccessGateInfo {
  id: string;
  gate: TenantAccessGateFn;
  order: number;
}

/**
 * @internal
 */
export namespace internal {
  export const RegisterTenantAccessGate = new RegisteringProxy<
    (info: TenantAccessGateInfo) => void
  >();
}

/**
 * Register a tenant access gate: a tenant-level, binary access check applied
 * at every tenant authorization surface (permission guards, tenant member /
 * owner guards, table-view data routes, page and menu visibility, realtime
 * page access). Use it to deny a tenant access to the product entirely, e.g.
 * when its subscription is suspended.
 *
 * This is deliberately NOT part of the permissions pipeline: gates also block
 * surfaces that permissions cannot express (defaultGranted permissions,
 * membership-only guards). For granular permission shaping, use
 * `RegisterPermissionsResolver` from `dms/permissions-resolver`.
 *
 * Semantics:
 * - Gates run in ascending `order` (ties in registration order); the first
 *   denial wins and its `code` is returned to the client as the 403 body.
 * - A gate that throws fails the request (fail-closed).
 * - The registration is automatically removed when the registering module is
 *   unloaded.
 * - Call during your module's `construct()` so the gate is active before the
 *   API starts serving requests.
 *
 * Routes that must stay reachable for a denied tenant (billing, recovery)
 * opt out explicitly with the `bypassTenantAccessGate` option of
 * `AuthTenantMember` / `AuthTenantOwner`, or of `TableViewOptions` for
 * table-view data routes.
 */
export function RegisterTenantAccessGate(info: TenantAccessGateInfo): void {
  internal.RegisterTenantAccessGate.register(info);
}

/**
 * Run the registered gates for the given user and tenant. Returns the first
 * denial, or `{ allowed: true }` when every gate passes. `userId` is
 * undefined for unauthenticated requests.
 */
export const CheckTenantAccess =
  InterfaceFunction<
    (
      userId: string | undefined,
      tenantId: string,
    ) => Promise<TenantAccessResult>
  >();

/**
 * Assert that the tenant is accessible; throws a 403 whose body is the
 * denying gate's `code` (a machine-readable i18n key) otherwise.
 */
export async function AssertTenantAccess(
  userId: string | undefined,
  tenantId: string,
): Promise<void> {
  const result = await CheckTenantAccess(userId, tenantId);
  if (!result.allowed) {
    throw new HTTPResult(HTTP_FORBIDDEN_STATUS, result.code);
  }
}

/**
 * The surface flags a denied tenant may still reach.
 */
export interface GatedSurface {
  bypassTenantAccessGate?: boolean;
  publicAccess?: boolean;
  authOnly?: boolean;
}

/**
 * Whether a surface survives a denying gate.
 *
 * The single answer every access path must ask, so the menu, the page layout
 * route and realtime page access can never drift apart: each of them decides
 * the same way, then returns outright rather than emptying a permission set
 * and hoping the downstream check agrees.
 *
 * Surfaces flagged `bypassTenantAccessGate` opt in explicitly (billing and
 * other recovery screens). `publicAccess` and `authOnly` surfaces survive too:
 * they drop permission checks by design and carry the auth screens and the
 * suspended-workspace screen, which a denied tenant has to reach to recover.
 * Permission checks still apply on top of this — a surface that survives the
 * gate is not thereby granted to everyone.
 */
export function gateAllowsSurface(
  surface: GatedSurface,
  gateDenied: boolean,
): boolean {
  if (!gateDenied) return true;
  return (
    surface.bypassTenantAccessGate === true ||
    surface.publicAccess === true ||
    surface.authOnly === true
  );
}
