import {
  Context,
  Get,
  JSONBody,
  Parameter,
  Post,
  Put,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assertValidation } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import { RegisterDataController } from "@antelopejs/interface-data-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type { FormComponents } from "@antelopejs/interface-dms/base/form";
import {
  type ConfirmDialogSerialized,
  TableViewMeta,
  type TableViewOptionsSerialized,
} from "@antelopejs/interface-dms/base/table-view";
import { registerTableViewActions } from "@antelopejs/interface-dms/base/table-view/factory-helpers";
import {
  type Action,
  ComponentBuilder,
} from "@antelopejs/interface-dms/component";
import { roleSettingDataAPI } from "@antelopejs/interface-dms/data-controllers/roles";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  GetEffectiveUserPermissions,
  GetPermission,
  GetPermissions,
  HasPermission,
} from "@antelopejs/interface-dms/permissions";
import { ApplyPermissionsResolvers } from "@antelopejs/interface-dms/permissions-resolver";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import {
  GetCategoryPermissionIds,
  type PermissionPreviewGrants,
  type PermissionPreviewPage,
  type PreviewPageLossCheck,
  resolvePermissionPreviewAccess,
} from "../../../implementations/dms/page";
import { notifyRolePermissionsChanged } from "../../../utils/workspace-notifications";
import {
  roleDeleteSchema,
  roleDuplicateSchema,
  roleEditorSchema,
  rolePreviewSchema,
} from "../../../validation/role-editor.schema";
import { userCategory } from "./category";
import { mapPermissionTreeToPermissionNodes } from "./permission-tree-nodes";
import type {
  RoleEditorCapabilities,
  RoleEditorPermissionNode,
  RolesOverview,
} from "./role-editor";
import {
  assertRoleUnused,
  createRole,
  deleteRole,
  duplicateRole,
  loadRoleDeleteConfirm,
  loadRoleEditorTree,
  loadRolesOverview,
  type RoleEditorActor,
  updateRole,
} from "./role-editor-store";
import {
  classifyPreviewBlocks,
  collectPreviewLayout,
  countOutOfScope,
  listPermissionChildren,
  listPreviewPermissionIds,
  losesOnPreviewPage,
  type RolePreviewBlock,
  type RolePreviewResult,
  sanitizePreviewPermissions,
} from "./role-preview";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";

RegisterDataController()(roleSettingDataAPI);

const ROLES_EDITOR_COMPONENT_NAME = "DmsSettingsRoles";

/** Id of a role created or copied by the roles editor. */
export interface CreatedRole {
  id: string;
}

/**
 * The roles editor, mounted as the page's `table` and standing in for a
 * TableView over `roleSettingDataAPI`: it declares a table's actions, so the
 * grantable ids stay `settings.user.roles.table.{list,add,edit,…}` and roles
 * saved before the editor keep granting the same rights.
 */
export const rolesEditor = new ComponentBuilder<TableViewOptionsSerialized>(
  ROLES_EDITOR_COMPONENT_NAME,
).meta({ name: "$page.settings.roles.table.caption", icon: "i-ph-key" });

registerTableViewActions(rolesEditor, {
  hasNewForm: true,
  hasEditForm: true,
  hasViewForm: true,
  hasDeleteEndpoint: true,
  archiveMode: false,
  isExportEnabled: true,
});

// The data routes (`/api/tables/roles`, behind the member and invite role
// pickers) authorize against the component writing through them: the editor,
// so they are guarded by the same ids.
const rolesMeta = GetMetadata(roleSettingDataAPI, TableViewMeta);
rolesMeta.addComponentBuilder(rolesEditor);
rolesMeta.setControllerGuards({
  delete: async (ctx, { ids }) => {
    const tenantId = getRequestTenantId(ctx);
    for (const id of ids) await assertRoleUnused(tenantId, id);
  },
});

function requireEditorAction(id: string): Action {
  const action = rolesEditor.getAction(id);
  if (!action) {
    throw new Error(`Roles editor is expected to register a '${id}' action`);
  }
  return action;
}

const listAction = requireEditorAction("list");
const addAction = requireEditorAction("add");
const editAction = requireEditorAction("edit");
const deleteAction = requireEditorAction("delete");

async function resolveActor(
  ctx: RequestContext,
  user: User,
): Promise<RoleEditorActor> {
  const tenantId = getRequestTenantId(ctx);
  const member = await GetModel(TenantMemberModel, tenantId).getByUser(
    user._id,
  );
  const permissions = await GetEffectiveUserPermissions(
    user,
    tenantId,
    member?.roleIds ?? [],
    GetModel(RoleModel, tenantId),
  );
  return { tenantId, permissions };
}

async function holdsAction(
  actor: RoleEditorActor,
  action: Action,
): Promise<boolean> {
  const { permissionId } = action;
  return !permissionId || HasPermission(actor.permissions, permissionId);
}

async function resolveCapabilities(
  actor: RoleEditorActor,
): Promise<RoleEditorCapabilities> {
  const [canAdd, canEdit, canDelete] = await Promise.all(
    [addAction, editAction, deleteAction].map((action) =>
      holdsAction(actor, action),
    ),
  );
  return { canAdd, canEdit, canDelete };
}

/** The ids of `ids` that a permission set grants, as `HasPermission` decides. */
async function grantedAmong(
  permissions: Set<string>,
  ids: Iterable<string>,
): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  const held = await Promise.all(
    unique.map((id) => HasPermission(permissions, id)),
  );
  return new Set(unique.filter((_, index) => held[index]));
}

async function previewTitleOf(permissionId: string): Promise<string> {
  const permission = await GetPermission(permissionId);
  return permission?.title ?? permissionId.split(".").at(-1) ?? permissionId;
}

/**
 * What a permission set changes on the blocks of a page the viewer is served:
 * the same reading for the previewed page and for every page of the menu.
 *
 * @param titleOf Title of a withheld action; its id when omitted.
 */
async function classifyPagePreview(
  page: PermissionPreviewPage,
  grants: PermissionPreviewGrants,
  titleOf?: (permissionIds: string[]) => Promise<(id: string) => string>,
): Promise<Record<string, RolePreviewBlock>> {
  const tree = await GetPermissions();
  const nodes = page.filtersComponents
    ? collectPreviewLayout(page.components, page.pagePermissionId, (id) =>
        listPermissionChildren(tree, id),
      )
    : [];
  const ids = listPreviewPermissionIds(nodes);
  const [real, granted, universal, title] = await Promise.all([
    grantedAmong(grants.real, ids),
    grantedAmong(grants.preview, ids),
    grantedAmong(new Set(), ids),
    titleOf?.(ids),
  ]);
  return classifyPreviewBlocks(
    nodes,
    { real, preview: granted, universal },
    page.hiddenInPreview,
    title,
  );
}

async function loadPreviewTitles(
  ids: string[],
): Promise<(id: string) => string> {
  const titles = new Map(
    await Promise.all(
      ids.map(async (id) => [id, await previewTitleOf(id)] as const),
    ),
  );
  return (id) => titles.get(id) ?? id;
}

/**
 * Whether the previewed role loses anything on a page of the menu it can
 * open, read like the previewed page. One function for every request, so the
 * answers are cached per viewer and permission set.
 */
const pageLosesInPreview: PreviewPageLossCheck = async (page, grants) => {
  if (losesOnPreviewPage({}, page.hiddenHeaderActions)) return true;
  return losesOnPreviewPage(await classifyPagePreview(page, grants), []);
};

/**
 * What a role's permissions would change on the menu and on one page, for the
 * viewer previewing it. Read-only: the session keeps its own permissions, and
 * only what the viewer is already served is ever compared.
 */
async function previewRole(
  ctx: RequestContext,
  user: User,
  rolePermissions: string[],
  path: string | undefined,
): Promise<RolePreviewResult> {
  const actor = await resolveActor(ctx, user);
  const preview = await ApplyPermissionsResolvers(
    user._id,
    actor.tenantId,
    sanitizePreviewPermissions(rolePermissions),
  );
  const access = await resolvePermissionPreviewAccess({
    path,
    user,
    memberModel: GetModel(TenantMemberModel, actor.tenantId),
    roleModel: GetModel(RoleModel, actor.tenantId),
    tenantId: actor.tenantId,
    previewPermissions: preview,
    pageLoses: pageLosesInPreview,
  });
  const realInPreview = await grantedAmong(actor.permissions, preview);
  const outOfScope = countOutOfScope(preview, (id) => realInPreview.has(id));
  const { page } = access;
  const menu = {
    hiddenEntries: access.hiddenEntries,
    partialEntries: access.partialEntries,
    hiddenQuickActions: access.hiddenQuickActions,
    outOfScope,
  };
  if (!page) {
    return { ...menu, page: null, blocks: {}, hiddenHeaderActions: [] };
  }
  return {
    ...menu,
    page: {
      fullId: page.fullId,
      displayName: page.displayName,
      hidden: page.hiddenInPreview,
    },
    blocks: await classifyPagePreview(
      page,
      { real: actor.permissions, preview },
      loadPreviewTitles,
    ),
    hiddenHeaderActions: page.hiddenHeaderActions,
  };
}

@RegisterPage()
export class RolesSettingsController extends PageController("roles", {
  displayName: "$menu.roles",
  category: userCategory,
  icon: "i-ph-key",
  order: 6,
  description: "$page.settings.description.roles",
}) {
  static table = rolesEditor;

  /** Tree of the `PermissionsType` field in the role pickers' add form. */
  @Get("permissions-tree")
  async getPermissionsTree(): Promise<FormComponents.PermissionsTreeNode[]> {
    return mapPermissionTreeToPermissionNodes(
      await GetPermissions(),
      GetCategoryPermissionIds(),
    );
  }

  /**
   * Roles with their member, invitation and permission counts, the tenant
   * owners and what the signed-in user may change.
   */
  @Get("overview")
  async getOverview(
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(listAction) user: User,
  ): Promise<RolesOverview> {
    const actor = await resolveActor(ctx, user);
    return loadRolesOverview(actor, await resolveCapabilities(actor));
  }

  /** Permission tree of the editor, with descriptions and dependencies. */
  @Get("editor-tree")
  async getEditorTree(
    @AuthUserWithPermission(listAction) _user: User,
  ): Promise<RoleEditorPermissionNode[]> {
    return loadRoleEditorTree();
  }

  /**
   * Preview a role — its unsaved edits included — on the menu and on one
   * page. Guarded like saving a role: only who may edit roles may look at the
   * dashboard through one, and never beyond their own access.
   */
  @Post("preview")
  async preview(
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(editAction) user: User,
    @JSONBody() body: unknown,
  ): Promise<RolePreviewResult> {
    const { permissions, path } = assertValidation(body, (v) =>
      rolePreviewSchema.parse(v),
    );
    return previewRole(ctx, user, permissions, path);
  }

  @Post("create")
  async create(
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(addAction) user: User,
    @JSONBody() body: unknown,
  ): Promise<CreatedRole> {
    const input = assertValidation(body, (v) => roleEditorSchema.parse(v));
    return { id: await createRole(await resolveActor(ctx, user), input) };
  }

  @Put(":id")
  async update(
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(editAction) user: User,
    @Parameter("id", "param") roleId: string,
    @JSONBody() body: unknown,
  ): Promise<void> {
    const input = assertValidation(body, (v) => roleEditorSchema.parse(v));
    const actor = await resolveActor(ctx, user);
    const { name, permissionsChanged } = await updateRole(actor, roleId, input);
    if (permissionsChanged) {
      fireAndForget(
        notifyRolePermissionsChanged({
          tenantId: actor.tenantId,
          roleId,
          roleName: name,
          actor: { id: user._id, name: user.name || user.email },
        }),
        "role permissions change notification",
      );
    }
  }

  @Post(":id/duplicate")
  async duplicate(
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(addAction) user: User,
    @Parameter("id", "param") roleId: string,
    @JSONBody() body: unknown,
  ): Promise<CreatedRole> {
    const { name } = assertValidation(body, (v) =>
      roleDuplicateSchema.parse(v),
    );
    const actor = await resolveActor(ctx, user);
    return { id: await duplicateRole(actor, roleId, name) };
  }

  /** The delete dialog of a role: who still holds it, and where they go. */
  @Get(":id/delete-confirm")
  async deleteConfirm(
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(deleteAction) _user: User,
    @Parameter("id", "param") roleId: string,
  ): Promise<ConfirmDialogSerialized> {
    return loadRoleDeleteConfirm(getRequestTenantId(ctx), roleId);
  }

  @Post(":id/delete")
  async remove(
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(deleteAction) user: User,
    @Parameter("id", "param") roleId: string,
    @JSONBody() body: unknown,
  ): Promise<void> {
    const input = assertValidation(body, (v) => roleDeleteSchema.parse(v));
    await deleteRole(await resolveActor(ctx, user), roleId, input);
  }
}
