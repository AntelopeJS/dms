import type { PageHeaderActionSerialized } from "../base/layouts";
import type { WatchAction } from "../base/types/watch";
import type {
  ComponentInfo,
  ChildSerialized,
  ComponentFilterContext,
  ComponentInfoSerialized,
} from "../component";
import { HasPermission } from "../permissions";
import type { ComponentTreeNode } from "./component-tree";

/**
 * Every component of the page, keyed by the permission id of its position —
 * what the registration established by walking the component tree.
 */
export type ComponentNodeMap = Map<string, ComponentTreeNode>;

async function filterComponentInfo(
  comp: ComponentInfoSerialized,
  permissionId: string,
  permissions: Set<string>,
  componentMap: ComponentNodeMap,
  context: ComponentFilterContext,
): Promise<ComponentInfoSerialized> {
  const filtered = { ...comp };

  if (filtered.children && filtered.children.length > 0) {
    filtered.children = await filterAccessibleChildren(
      filtered.children,
      permissionId,
      permissions,
      componentMap,
      context,
    );
  }

  const component = componentMap.get(permissionId)?.component;
  if (component?.onFilterCallback && filtered.options) {
    filtered.options = await component.onFilterCallback(
      permissions,
      filtered.options,
      permissionId,
      context,
    );
  }

  filtered.options = filterRequiredPermissionWatches(
    filtered.options,
    permissions,
  );

  return filtered;
}

function filterRequiredPermissionWatches(
  options: unknown,
  permissions: Set<string>,
): typeof options {
  if (!options || typeof options !== "object") {
    return options;
  }
  const opts = options as Record<string, unknown> & {
    watchActions?: WatchAction[];
  };
  if (!Array.isArray(opts.watchActions) || opts.watchActions.length === 0) {
    return options;
  }
  return {
    ...opts,
    watchActions: opts.watchActions.filter(
      (w) => !w.requirePermission || permissions.has(w.requirePermission),
    ),
  };
}

/**
 * Whether a child of an already-granted component is served.
 *
 * Every child reached during registration has its own permission. A withheld
 * child shares its id with an action of its parent, so no answer about that id
 * describes it.
 *
 * A child the registration never walked — for example, one hanging off a
 * promised `ComponentInfo` — has no node here and fails closed even if a stale
 * role still carries the derived id.
 */
function childIsAccessible(
  permissions: Set<string>,
  permissionId: string,
  node: ComponentTreeNode | undefined,
): Promise<boolean> {
  if (!node || node.access === "withheld") return Promise.resolve(false);
  return HasPermission(permissions, permissionId);
}

async function filterAccessibleChildren(
  children: ChildSerialized[],
  permissionId: string,
  permissions: Set<string>,
  componentMap: ComponentNodeMap,
  context: ComponentFilterContext,
): Promise<ChildSerialized[]> {
  const childrenWithPermissions = await Promise.all(
    children.map(async (child: ChildSerialized) => {
      const childPermissionId = `${permissionId}.${child.id}`;
      return {
        child,
        hasPermission: await childIsAccessible(
          permissions,
          childPermissionId,
          componentMap.get(childPermissionId),
        ),
      };
    }),
  );

  return Promise.all(
    childrenWithPermissions
      .filter(({ hasPermission }) => hasPermission)
      .map(async ({ child }) => {
        const { id, component, ...additionalProps } = child;
        return {
          id,
          component: await filterComponentInfo(
            component,
            `${permissionId}.${id}`,
            permissions,
            componentMap,
            context,
          ),
          ...additionalProps,
        };
      }),
  );
}

export async function filterComponents(
  components: Record<string, ComponentInfoSerialized>,
  basePath: string,
  permissions: Set<string>,
  componentMap: ComponentNodeMap,
  context: ComponentFilterContext,
): Promise<Record<string, ComponentInfoSerialized>> {
  const filtered: Record<string, ComponentInfoSerialized> = {};

  for (const [key, comp] of Object.entries(components)) {
    const permissionId = `${basePath}.${key}`;
    if (await HasPermission(permissions, permissionId)) {
      filtered[key] = await filterComponentInfo(
        comp,
        permissionId,
        permissions,
        componentMap,
        context,
      );
    }
  }

  return filtered;
}

/**
 * The page layout (the frame around the components) as one caller may see it:
 * the header actions declaring a `permission` the caller lacks are left out.
 * `loadPermissions` is only called when an action declares one.
 */
export async function filterLayoutHeaderActions<T>(
  layout: ComponentInfo<T> | undefined,
  loadPermissions: () => Promise<Set<string>>,
): Promise<ComponentInfo<T> | undefined> {
  const options = layout?.options as
    | { headerActions?: PageHeaderActionSerialized[] }
    | undefined;
  const actions = options?.headerActions;
  if (!layout || !actions?.some((action) => action.permission)) {
    return layout;
  }
  const permissions = await loadPermissions();
  const granted = await Promise.all(
    actions.map((action) =>
      action.permission
        ? HasPermission(permissions, action.permission)
        : Promise.resolve(true),
    ),
  );
  return {
    ...layout,
    options: {
      ...options,
      headerActions: actions.filter((_, index) => granted[index]),
    } as T,
  };
}
