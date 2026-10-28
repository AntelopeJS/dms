import {
  checkboxState,
  grantPermission,
  revokePermission,
  type PermissionIndex,
} from "../../layers/dms-layout/app/entries/components/pages/settings/roles/role-permissions";
import type { RolePermissionNode } from "../../layers/dms-layout/app/entries/components/pages/settings/roles/role-types";
const TREE: RolePermissionNode[] = [
  {
    id: "pages",
    label: "Pages",
    children: [
      {
        id: "pages.sales",
        label: "Sales",
        children: [
          { id: "pages.sales.export", label: "Export orders" },
          {
            id: "pages.sales.orders",
            label: "Orders",
            children: [
              { id: "pages.sales.orders.read", label: "View orders" },
              {
                id: "pages.sales.orders.refund",
                label: "Refund orders",
                dependencies: ["pages.sales.orders.read"],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    children: [
      {
        id: "settings.user",
        label: "User settings",
        children: [
          {
            id: "settings.user.roles",
            label: "Roles",
            children: [
              {
                id: "settings.user.roles.table",
                label: "Roles list",
                children: [
                  { id: "settings.user.roles.table.list", label: "List" },
                  {
                    id: "settings.user.roles.table.edit",
                    label: "Edit",
                    dependencies: ["settings.user.roles.table.view"],
                  },
                  { id: "settings.user.roles.table.view", label: "View" },
                ],
              },
            ],
          },
          {
            id: "settings.user.profile",
            label: "Profile",
            children: [
              {
                id: "settings.user.profile.profileComponent",
                label: "Personal information",
              },
            ],
          },
        ],
      },
    ],
  },

  {
    id: "media.upload",
    label: "Upload",
    children: [{ id: "media.upload.form", label: "Form" }],
  },
  { id: "examples", label: "Examples" },
];

const identity = (label: string) => label;
const anyone = () => true;

/**
 * The roles form the editor replaced (the `PermissionsTree` field, since
 * removed), kept here verbatim in behaviour: roles it saved must read the same
 * in the editor, so the editor has to store the same ids as it did.
 */
const original = {
  findNodeById(
    id: string,
    nodes: RolePermissionNode[],
  ): RolePermissionNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = original.findNodeById(id, node.children);
        if (found) return found;
      }
    }
    return null;
  },
  getAllChildIds(node: RolePermissionNode): string[] {
    return [node.id, ...(node.children ?? []).flatMap(original.getAllChildIds)];
  },
  getAncestorPaths(path: string): string[] {
    const parts = path.split(".");
    const paths: string[] = [];
    for (let i = parts.length; i > 0; i--) {
      paths.push(parts.slice(0, i).join("."));
    }
    return paths;
  },
  shouldRemoveParent(parentId: string, remainingIds: string[]): boolean {
    const parentNode = original.findNodeById(parentId, TREE);
    if (!parentNode || !parentNode.children) return false;
    const descendantIds = original
      .getAllChildIds(parentNode)
      .filter((id) => id !== parentNode.id);
    return !descendantIds.some((id) => remainingIds.includes(id));
  },
  /** `handleCheckChange` of the original form. */
  check(selected: string[], node: RolePermissionNode, checked: boolean) {
    const descendantIds = original.getAllChildIds(node);
    const ancestorPaths = original.getAncestorPaths(node.id);
    if (checked) {
      return [...new Set([...selected, ...descendantIds, ...ancestorPaths])];
    }
    let remainingIds = selected.filter((id) => !descendantIds.includes(id));
    const ancestorsToRemove = ancestorPaths.filter((ancestorId) =>
      original.shouldRemoveParent(ancestorId, remainingIds),
    );
    remainingIds = remainingIds.filter((id) => !ancestorsToRemove.includes(id));
    return remainingIds;
  },
  /** Checkbox value of the original form's tree node. */
  checkbox(selected: string[], node: RolePermissionNode) {
    if (node.children && node.children.length > 0) {
      const descendantIds = original
        .getAllChildIds(node)
        .filter((id) => id !== node.id);
      const checkedCount = descendantIds.filter((id) =>
        selected.includes(id),
      ).length;
      if (checkedCount > 0 && checkedCount < descendantIds.length) {
        return "indeterminate" as const;
      }
    }
    return selected.includes(node.id);
  },
};

/** A click on a checkbox: a mixed or empty box checks, a checked one clears. */
function clickedValue(state: boolean | "indeterminate"): boolean {
  return state === "indeterminate" ? true : !state;
}

/** The editor's toggle (`useRoleEditor.toggle`) with everything grantable. */
function editorClick(
  index: PermissionIndex,
  selection: Set<string>,
  id: string,
): Set<string> {
  const checked = clickedValue(checkboxState(index, id, selection));
  return checked
    ? grantPermission(index, selection, id, anyone).selection
    : revokePermission(index, selection, id);
}

/** Deterministic pseudo-random sequence (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const sorted = (ids: Iterable<string>) => [...new Set(ids)].sort();

function withoutDependencies(
  nodes: RolePermissionNode[],
): RolePermissionNode[] {
  return nodes.map(({ dependencies: _dependencies, children, ...node }) => {
    const result: RolePermissionNode = { ...node };
    if (children) result.children = withoutDependencies(children);
    return result;
  });
}

export {
  TREE,
  identity,
  anyone,
  original,
  clickedValue,
  editorClick,
  seeded,
  sorted,
  withoutDependencies,
};
