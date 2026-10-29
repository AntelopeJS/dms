import { TenantMemberModel, RoleModel } from "@antelopejs/interface-dms/db";
import {
  type PermissionsResolverContext,
  ApplyPermissionsResolvers,
} from "@antelopejs/interface-dms/permissions-resolver";
import type { ViewerModelResult } from "./types";

export function previewMemberModels(previewPermissions: Set<string>) {
  const roleIds = [PREVIEW_ROLE_ID];
  const roles = [
    { _id: PREVIEW_ROLE_ID, permissions: [...previewPermissions] },
  ];

  // oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- PageLayoutHandler requires full models; inference and Pick expose only these preview lookup methods.
  return {
    memberModel: {
      getByUser: async () => ({ roleIds }),
    } as unknown as TenantMemberModel,
    roleModel: { getBy: async () => roles } as unknown as RoleModel,
  };
  // oxlint-enable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion
}

export function memoizeViewerModels(
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
) {
  const answers = new Map<string, Promise<ViewerModelResult>>();
  const remember = (
    key: string,
    read: () => PromiseLike<ViewerModelResult>,
  ): Promise<ViewerModelResult> => {
    const known = answers.get(key);
    if (known) return known;
    const pending = Promise.resolve(read());
    answers.set(key, pending);
    return pending;
  };

  // oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- Layout callbacks require full models; inference and Pick expose only the cached lookup methods.
  return {
    memberModel: {
      getByUser: (userId: string) =>
        remember(`member:${userId}`, () => memberModel.getByUser(userId)),
    } as TenantMemberModel,
    roleModel: {
      getBy: (...args: Parameters<RoleModel["getBy"]>) =>
        remember(`roles:${JSON.stringify(args)}`, () =>
          roleModel.getBy(...args),
        ),
    } as unknown as RoleModel,
  };
  // oxlint-enable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion
}

export const PREVIEW_ROLE_ID = "dms-permission-preview";

/** What the resolvers are told when they shape a previewed role's set. */
export function previewResolverContext(
  rolePermissions: ReadonlySet<string>,
): PermissionsResolverContext {
  return { preview: { rolePermissions } };
}

/**
 * The effective permissions of a member holding only `rolePermissions`, as
 * `viewerId` previews them: the registered resolvers run over the set with
 * the preview context, which tells them to shape it as for an ordinary
 * member, never from the viewer's standing. Without any resolver, the set as
 * given.
 */
export function resolvePreviewPermissions(
  viewerId: string,
  tenantId: string,
  rolePermissions: Set<string>,
): Promise<Set<string>> {
  return ApplyPermissionsResolvers(
    viewerId,
    tenantId,
    rolePermissions,
    previewResolverContext(rolePermissions),
  );
}
