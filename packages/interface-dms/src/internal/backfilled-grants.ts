import type { Permission } from "../permissions";

const ID_SEPARATOR = ".";

/**
 * Table view actions that came to depend on their table's `list` (and
 * `restore` on `viewArchived`) after roles had been stored with them.
 */
const ACTIONS_GAINING_DEPENDENCIES = new Set([
  "add",
  "edit",
  "view",
  "delete",
  "archive",
  "restore",
  "viewArchived",
  "export",
]);

/** The dependencies those actions gained. */
const BACKFILLED_DEPENDENCIES = new Set(["list", "viewArchived"]);

function actionIdOf(permissionId: string): string {
  return permissionId.slice(permissionId.lastIndexOf(ID_SEPARATOR) + 1);
}

/**
 * A stored role's permissions completed with the `list` and `viewArchived`
 * that the table view actions it holds now depend on: a role saved before
 * those dependencies existed keeps every right it had, instead of losing its
 * `edit` to a `list` it was never given. Every route saving a role adds them
 * (`withRequiredPermissions`), so the completion only ever changes roles
 * stored before, and a role saved again is stored with them; applied to a
 * completed role, it changes nothing.
 *
 * Takes the permission lookup rather than importing it, so the public
 * permissions module can apply it without an import cycle.
 *
 * @internal
 */
export async function withBackfilledDependencies(
  permissions: string[],
  getPermission: (id: string) => Promise<Permission | undefined>,
): Promise<string[]> {
  const completed = new Set(permissions);
  const pending = permissions.filter((id) =>
    ACTIONS_GAINING_DEPENDENCIES.has(actionIdOf(id)),
  );
  for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
    const permission = await getPermission(id);
    for (const dependencyId of permission?.dependencies ?? []) {
      if (completed.has(dependencyId)) continue;
      if (!BACKFILLED_DEPENDENCIES.has(actionIdOf(dependencyId))) continue;
      completed.add(dependencyId);
      pending.push(dependencyId);
    }
  }
  return completed.size === permissions.length ? permissions : [...completed];
}
