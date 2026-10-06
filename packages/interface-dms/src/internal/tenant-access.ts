/**
 * The surface flags a denied tenant may still reach.
 *
 * @internal
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
 *
 * @internal
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
