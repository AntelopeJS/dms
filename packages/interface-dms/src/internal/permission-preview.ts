import type { PermissionsResolverContext } from "../permissions-resolver";

/**
 * Whom a role preview's permissions are computed for: a member of no
 * workspace, so neither the viewer nor a tenant owner. A real user id never
 * takes this shape.
 *
 * @internal
 */
export const PERMISSION_PREVIEW_MEMBER_ID = "dms-permission-preview-member";

/**
 * The resolver context of a computation for `userId`: a role preview's for the
 * preview member, whose base set is the previewed role's; none otherwise.
 *
 * @internal
 */
export function permissionsResolverContextFor(
  userId: string,
  basePermissions: ReadonlySet<string>,
): PermissionsResolverContext {
  if (userId !== PERMISSION_PREVIEW_MEMBER_ID) return {};
  return { preview: { rolePermissions: basePermissions } };
}
