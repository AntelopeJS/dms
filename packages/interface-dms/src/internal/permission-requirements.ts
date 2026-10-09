import { GetPermission } from "../permissions";
import { permissionIdAncestors } from "./permission-ids";

/**
 * A role's permission set completed with everything its permissions need:
 * the ids each one sits under, and the `dependencies` a registered permission
 * declares (a table's edit needs its view, the read that loads the row), with
 * what those need in turn. What a role is stored with, whichever route saved
 * it, as the roles editor grants it.
 *
 * @internal
 */
export async function withRequiredPermissions(
  permissions: string[],
): Promise<string[]> {
  const required = new Set<string>();
  const pending = [...permissions];
  for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
    if (required.has(id)) continue;
    required.add(id);
    const permission = await GetPermission(id);
    pending.push(
      ...permissionIdAncestors(id),
      ...(permission?.dependencies ?? []),
    );
  }
  return [...required];
}
