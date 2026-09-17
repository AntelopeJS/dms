import { Get } from "@antelopejs/interface-api";
import { RegisterDataController } from "@antelopejs/interface-data-api";
import { roleSettingDataAPI } from "@antelopejs/interface-dms/data-controllers/roles";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  GetPermissions,
  type PermissionTree,
} from "@antelopejs/interface-dms/permissions";
import { TableView } from "@antelopejs/interface-dms/base";
import type { FormComponents } from "@antelopejs/interface-dms/base/form";
import { userCategory } from "./category";

RegisterDataController()(roleSettingDataAPI);

function mapPermissionTreeToPermissionNodes(
  permissionTree: Record<string, PermissionTree>,
): FormComponents.PermissionsTreeNode[] {
  return Object.values(permissionTree)
    .filter((node) => node.data && !node.data.defaultGranted) // Only include nodes with data and not default granted
    .map((node) => {
      const permissionNode: FormComponents.PermissionsTreeNode = {
        id: node.data?.id ?? "",
        label: node.data?.title ?? "Unknown Permission",
        icon: node.data?.icon,
        children:
          Object.keys(node.children).length > 0
            ? mapPermissionTreeToPermissionNodes(node.children)
            : undefined,
      };
      return permissionNode;
    });
}

@RegisterPage()
export class RolesSettingsController extends PageController("roles", {
  displayName: "$menu.roles",
  category: userCategory,
  icon: "i-ph-key",
  order: 6,
  description: "$page.settings.description.roles",
}) {
  @Get("permissions-tree")
  async getPermissionsTree(): Promise<FormComponents.PermissionsTreeNode[]> {
    const permissionTree = await GetPermissions();
    return mapPermissionTreeToPermissionNodes(permissionTree);
  }

  static table = TableView(roleSettingDataAPI, {
    caption: "$page.settings.roles.table.caption",
    rowActions: {
      add: true,
      copyLink: true,
      delete: { isEnabled: true, isVisible: true },
      details: true,
      duplicate: true,
      edit: { isEnabled: true, isVisible: true },
      hasSelection: true,
    },
    formContainer: { type: "page" },
  });
}
