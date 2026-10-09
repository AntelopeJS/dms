const ID_SEPARATOR = ".";

/**
 * The ids a dotted permission id sits under, closest first: `a.b.c` gives
 * `a.b` and `a`. A component's id extends its page's, an action's its
 * component's, so these are the permissions it depends on.
 *
 * @internal
 */
export function permissionIdAncestors(id: string): string[] {
  const parts = id.split(ID_SEPARATOR);
  return parts
    .slice(1)
    .map((_, position) =>
      parts.slice(0, parts.length - position - 1).join(ID_SEPARATOR),
    );
}

/**
 * A role's permission set completed with every id its permissions sit under,
 * deduplicated: what the roles editor grants with a permission, and what a
 * role is stored with whichever route saved it.
 *
 * @internal
 */
export function withPermissionAncestors(permissions: string[]): string[] {
  return [
    ...new Set(permissions.flatMap((id) => [id, ...permissionIdAncestors(id)])),
  ];
}
