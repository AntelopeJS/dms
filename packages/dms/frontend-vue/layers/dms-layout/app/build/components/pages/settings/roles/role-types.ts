/** A permission of the roles editor tree (`GET /settings/workspace/roles/editor-tree`). */
export interface RolePermissionNode {
  id: string;
  label: string;
  icon?: string;
  description?: string;
  /** Permissions this one needs; granting it grants them too. */
  dependencies?: string[];
  /** What granting it really allows, beyond its label (an i18n key). */
  warning?: string;
  children?: RolePermissionNode[];
}

/** A member shown on a role. */
export interface RoleMemberPreview {
  userId: string;
  name: string;
}

/** One role of the roles list (`GET /settings/workspace/roles/overview`). */
export interface RoleSummary {
  _id: string;
  name: string;
  description: string;
  permissions: string[];
  permissionCount: number;
  memberCount: number;
  members: RoleMemberPreview[];
  inviteCount: number;
}

/** The tenant owners, the locked Owner entry of the list. */
export interface RoleOwnersSummary {
  memberCount: number;
  members: RoleMemberPreview[];
}

/** What the signed-in user may change on the page. */
export interface RoleEditorCapabilities {
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** Payload of `GET /settings/workspace/roles/overview`. */
export interface RolesOverview {
  roles: RoleSummary[];
  owners: RoleOwnersSummary;
  totalPermissions: number;
  /** Permission ids the user may grant; `null` when they may grant any. */
  grantable: string[] | null;
  capabilities: RoleEditorCapabilities;
}

/** The role being edited: a saved role, or a new one not saved yet. */
export interface RoleDraft {
  id: string | null;
  name: string;
  description: string;
  permissions: string[];
}

/** Body of the delete call. */
export interface RoleDeleteRequest {
  /** Role given to the holders of the deleted one; none: they just lose it. */
  reassignTo: string | null;
}

/** Response of the create and duplicate calls. */
export interface CreatedRole {
  id: string;
}

/** Id of the Owner entry, which is not a stored role. */
export const OWNER_ENTRY_ID = "__owner__";

/** Id of the role being created, before it is saved. */
export const NEW_ROLE_ENTRY_ID = "__new__";

/** Base path of the roles page API. */
export const ROLES_API_PATH = "/settings/workspace/roles";

/** The roles' table data routes, which delete a role. */
export const ROLES_TABLE_API_PATH = "/api/tables/roles";

/** Bounds mirrored from the backend validation schema. */
export const ROLE_NAME_MAX_LENGTH = 80;
export const ROLE_DESCRIPTION_MAX_LENGTH = 240;

/** A field of the role editor's head an error can land on. */
export type RoleEditorField = "name" | "description";
