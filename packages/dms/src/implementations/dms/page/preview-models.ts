import {
  type Role,
  RoleModel,
  type TenantMember,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import {
  type PermissionsResolverContext,
  ApplyPermissionsResolvers,
} from "@antelopejs/interface-dms/permissions-resolver";

/**
 * Models on `database` under which every user is a member holding only the
 * preview role, which grants `previewPermissions`.
 */
export function previewMemberModels(
  database: TenantMemberModel["database"],
  previewPermissions: Set<string>,
) {
  const member = TenantMemberModel.fromPlainData({
    roleIds: [PREVIEW_ROLE_ID],
  });
  const roles = [
    RoleModel.fromPlainData({
      _id: PREVIEW_ROLE_ID,
      permissions: [...previewPermissions],
    }),
  ];
  class PreviewMemberModel extends TenantMemberModel {
    override async getByUser(): Promise<TenantMember> {
      return member;
    }
  }
  class PreviewRoleModel extends RoleModel {
    override async getBy(): Promise<Role[]> {
      return roles;
    }
  }
  return {
    memberModel: new PreviewMemberModel(database),
    roleModel: new PreviewRoleModel(database),
  };
}

function remember<T>(
  answers: Map<string, Promise<T>>,
  key: string,
  read: () => PromiseLike<T>,
): Promise<T> {
  const known = answers.get(key);
  if (known) return known;
  const pending = Promise.resolve(read());
  answers.set(key, pending);
  return pending;
}

/**
 * Models answering each member and role lookup of `memberModel` and
 * `roleModel` once, then from memory.
 */
export function memoizeViewerModels(
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
) {
  const members = new Map<string, Promise<TenantMember | undefined>>();
  const roleLists = new Map<string, Promise<Role[]>>();
  class CachedMemberModel extends TenantMemberModel {
    override getByUser(userId: string): Promise<TenantMember | undefined> {
      return remember(members, userId, () => memberModel.getByUser(userId));
    }
  }
  class CachedRoleModel extends RoleModel {
    override getBy(...args: Parameters<RoleModel["getBy"]>): Promise<Role[]> {
      return remember(roleLists, JSON.stringify(args), () =>
        roleModel.getBy(...args),
      );
    }
  }
  return {
    memberModel: new CachedMemberModel(memberModel.database),
    roleModel: new CachedRoleModel(roleModel.database),
  };
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
