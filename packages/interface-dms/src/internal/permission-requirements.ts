import { GetPermission } from "../permissions";
import { permissionIdAncestors } from "./permission-ids";

/**
 * A role's permission set completed with everything its permissions need:
 * the ids each one sits under, and the `dependencies` a registered permission
 * declares (a table's edit needs its view, the read that loads the row), with
 * what those need in turn. What a role is stored with, whichever route saved
 * it, as the roles editor grants it.
 *
 * Only registered permissions are added: an id nothing registers (a module
 * not loaded right now, a typo) is kept as given, but no parent is made up
 * from its dotted path — `does.not.exist` must not bring a `does` that a
 * module could register later.
 *
 * @internal
 */
export async function withRequiredPermissions(
  permissions: string[],
): Promise<string[]> {
  const required = new Set(permissions);
  const pending = [...required];
  for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
    const permission = await GetPermission(id);
    const needed = [
      ...permissionIdAncestors(id),
      ...(permission?.dependencies ?? []),
    ];
    for (const neededId of needed) {
      if (required.has(neededId) || !(await GetPermission(neededId))) continue;
      required.add(neededId);
      pending.push(neededId);
    }
  }
  return [...required];
}
