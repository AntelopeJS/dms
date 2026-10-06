import {
  type CreatedRole,
  type RoleDeleteRequest,
  type RoleDraft,
  type RolePermissionNode,
  ROLES_API_PATH,
  ROLES_TABLE_API_PATH,
  type RolesOverview,
} from "./role-types";

/** Body of the create and update calls. */
interface RoleWriteBody {
  name: string;
  description: string;
  permissions: string[];
}

function toWriteBody(draft: RoleDraft): RoleWriteBody {
  return {
    name: draft.name,
    description: draft.description,
    permissions: draft.permissions,
  };
}

/** Calls of the roles page API (`packages/dms/src/pages/settings/users/roles.ts`). */
export function useRolesApi() {
  const { $authFetch } = useAuthFetch();

  const fetchOverview = () =>
    $authFetch<RolesOverview>(`${ROLES_API_PATH}/overview`);

  const fetchTree = () =>
    $authFetch<RolePermissionNode[]>(`${ROLES_API_PATH}/editor-tree`);

  const createRole = (draft: RoleDraft) =>
    $authFetch<CreatedRole>(`${ROLES_API_PATH}/create`, {
      method: "POST",
      body: toWriteBody(draft),
    });

  const updateRole = (roleId: string, draft: RoleDraft) =>
    $authFetch<void>(`${ROLES_API_PATH}/${encodeURIComponent(roleId)}`, {
      method: "PUT",
      body: toWriteBody(draft),
    });

  const duplicateRole = (roleId: string, name: string) =>
    $authFetch<CreatedRole>(
      `${ROLES_API_PATH}/${encodeURIComponent(roleId)}/duplicate`,
      { method: "POST", body: { name } },
    );

  // The table's own delete: the answer of the delete dialog goes as its
  // body, which the roles' delete guard reads to move the holders.
  const deleteRole = (roleId: string, request: RoleDeleteRequest) =>
    $authFetch<number>(`${ROLES_TABLE_API_PATH}/delete`, {
      method: "DELETE",
      query: { id: roleId },
      body: request,
    });

  return {
    fetchOverview,
    fetchTree,
    createRole,
    updateRole,
    duplicateRole,
    deleteRole,
  };
}
