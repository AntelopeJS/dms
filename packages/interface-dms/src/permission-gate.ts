import { type ButtonPermission, resolveButtonPermissionId } from "./component";
import { HasPermission } from "./permissions";

/**
 * Who may use a button, a row action, a tab, a view or a header button.
 *
 * `permission` names an action relative to the owner — the table view for its
 * buttons, row actions, tabs and views, the page for a header button — like
 * `"edit"`, or is an `Action` of any component. `permissionId` is an absolute
 * permission id (`"pages.sales.invoices.export"`), for the rare gate that is
 * neither. `permissionId` wins when both are set.
 */
export interface PermissionGate {
  permission?: ButtonPermission;
  permissionId?: string;
}

/** Whether `gate` names a permission at all. */
export function isPermissionGated(gate: PermissionGate | undefined): boolean {
  return gate?.permission !== undefined || gate?.permissionId !== undefined;
}

/**
 * The permission id `gate` requires on an owner whose own permission id is
 * `ownerPermissionId`. Undefined for an ungated declaration, and for a
 * relative name on an owner that never registered — which
 * {@link holdsPermissionGate} refuses.
 */
export function resolvePermissionGateId(
  gate: PermissionGate | undefined,
  ownerPermissionId: string | undefined,
): string | undefined {
  if (gate?.permissionId !== undefined) return gate.permissionId;
  if (gate?.permission === undefined) return undefined;
  return resolveButtonPermissionId(gate.permission, ownerPermissionId);
}

/**
 * Whether a caller holding `permissions` passes `gate` on its owner. An
 * ungated declaration passes; a gate that cannot be resolved fails closed.
 */
export async function holdsPermissionGate(
  permissions: Set<string>,
  gate: PermissionGate | undefined,
  ownerPermissionId: string | undefined,
): Promise<boolean> {
  if (!isPermissionGated(gate)) return true;
  const permissionId = resolvePermissionGateId(gate, ownerPermissionId);
  return !!permissionId && (await HasPermission(permissions, permissionId));
}
