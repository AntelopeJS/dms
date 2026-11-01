import type {
  Permission,
  PermissionTree,
} from "@antelopejs/interface-dms/permissions";

const permissions = new Map<string, Permission>();
const permissionTree: Record<string, PermissionTree> = {};

function addPermissionToTree(permission: Permission): void {
  const parts = permission.id.split(".");
  let currentLevel = permissionTree;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (!currentLevel[part]) {
      currentLevel[part] = { children: {} };
    }

    if (i === parts.length - 1) {
      currentLevel[part].data = permission;
    }

    currentLevel = currentLevel[part].children;
  }
}

function removePermissionFromTree(id: string): void {
  const parts = id.split(".");
  const levels: Array<Record<string, PermissionTree>> = [permissionTree];
  let currentLevel = permissionTree;

  for (let i = 0; i < parts.length - 1; i++) {
    const node = currentLevel[parts[i]];
    if (!node) return;
    currentLevel = node.children;
    levels.push(currentLevel);
  }

  const target = currentLevel[parts[parts.length - 1]];
  if (!target) return;
  target.data = undefined;

  for (let i = parts.length - 1; i >= 0; i--) {
    const level = levels[i];
    const node = level[parts[i]];
    if (!node || node.data || Object.keys(node.children).length > 0) return;
    delete level[parts[i]];
  }
}

export namespace internal {
  export const RegisterPermission = {
    register: (id: string, permission: Permission): void => {
      permissions.set(id, permission);
      addPermissionToTree(permission);
    },
    unregister: (id: string): void => {
      permissions.delete(id);
      removePermissionFromTree(id);
    },
  };
}

export function GetPermission(id: string): Permission | undefined {
  return permissions.get(id);
}

export function GetPermissions() {
  return permissionTree;
}
