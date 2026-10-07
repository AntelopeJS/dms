import { resolveButtonPermissionId } from "../component";
import { HasPermission } from "../permissions";
import type { PermissionGate } from "../permission-gate";

/**
 * Whether `gate` names a permission at all.
 *
 * @internal
 */
export function isPermissionGated(gate: PermissionGate | undefined): boolean {
  return gate?.permission !== undefined || gate?.permissionId !== undefined;
}

/**
 * The permission id `gate` requires on an owner whose own permission id is
 * `ownerPermissionId`. Undefined for an ungated declaration, and for a
 * relative name on an owner that never registered — which
 * {@link holdsPermissionGate} refuses.
 *
 * @internal
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
 *
 * @internal
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
