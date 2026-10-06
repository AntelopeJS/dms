import { applyButtonAvailability } from "../base/button-availability";
import type {
  PageHeaderButtonDeclared,
  PageHeaderButtonSerialized,
} from "../base/layouts";
import type { CustomButtonSerialized } from "../base/types/custom-button";
import type { RowActionConfigSerialized } from "../base/types/row-action";
import type { WatchAction } from "../base/types/watch";
import type {
  ComponentInfo,
  ChildSerialized,
  ComponentFilterContext,
  ComponentInfoSerialized,
} from "../component";
import {
  holdsPermissionGate,
  isPermissionGated,
} from "../internal/permission-gate";
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

async function serveHeaderButton(
  button: PageHeaderButtonDeclared,
  permissions: () => Promise<Set<string>>,
  pagePermissionId: string | undefined,
  context: ComponentFilterContext,
): Promise<PageHeaderButtonSerialized | undefined> {
  const {
    permission: _permission,
    permissionId: _permissionId,
    availability,
    ...served
  } = button;
  if (
    isPermissionGated(button) &&
    !(await holdsPermissionGate(await permissions(), button, pagePermissionId))
  ) {
    return undefined;
  }
  return applyButtonAvailability(availability, served, context);
}

/**
 * The page layout (the frame around the components) as one caller may see it:
 * the header buttons whose gate the caller fails are left out — a `permission`
 * names an action of the page, relative to `pagePermissionId` — and those
 * whose `availability` refuses the request are disabled with its reason.
 * `loadPermissions` is only called when a button declares a permission.
 *
 * @internal
 */
export async function filterLayoutHeaderActions<T>(
  layout: ComponentInfo<T> | undefined,
  loadPermissions: () => Promise<Set<string>>,
  context: ComponentFilterContext,
  pagePermissionId: string | undefined,
): Promise<ComponentInfo<T> | undefined> {
  const options = layout?.options as
    | { headerActions?: PageHeaderButtonDeclared[] }
    | undefined;
  const buttons = options?.headerActions;
  if (!layout || !buttons) return layout;
  let loaded: Promise<Set<string>> | undefined;
  const permissions = () => (loaded ??= loadPermissions());
  const served = await Promise.all(
    buttons.map((button) =>
      serveHeaderButton(button, permissions, pagePermissionId, context),
    ),
  );
  return {
    ...layout,
    options: {
      ...options,
      headerActions: served.filter((button) => button !== undefined),
    } as T,
  };
}

/** What a component's options carry of the buttons it may place in the header. */
interface HeaderPlacingOptions {
  customButtons?: CustomButtonSerialized[];
  rowActions?: { add?: boolean | RowActionConfigSerialized };
}

const HEADER_PLACEMENT = "header";
const ADD_BUTTON_LABEL = "$dms.table.new_row";
const ADD_BUTTON_ICON = "i-ph-plus";
const ADD_BUTTON_COLOR = "primary";

/** The header buttons one component of the page places there. */
function componentHeaderButtons(
  componentId: string,
  component: ComponentInfoSerialized,
): PageHeaderButtonSerialized[] {
  const options = (component.options ?? {}) as HeaderPlacingOptions;
  const buttons: PageHeaderButtonSerialized[] = (options.customButtons ?? [])
    .filter((button) => button.placement === HEADER_PLACEMENT)
    .map(
      ({ id, target: _target, placement: _placement, ...button }, index) => ({
        ...button,
        id: `${componentId}:${id ?? index}`,
        componentId,
        buttonId: id,
      }),
    );
  const add = options.rowActions?.add;
  if (typeof add === "object" && add.placement === HEADER_PLACEMENT) {
    if (add.isEnabled === false) return buttons;
    buttons.push({
      id: `${componentId}:add`,
      label: add.label ?? ADD_BUTTON_LABEL,
      icon: add.icon ?? ADD_BUTTON_ICON,
      color: ADD_BUTTON_COLOR,
      componentId,
    });
  }
  return buttons;
}

/**
 * The layout with, after its own header buttons, those the components of the
 * page place in the header (`placement: "header"`): served as the components
 * were, so a button whose permission the caller lacks is already gone, and a
 * disabled one keeps its reason. The component still runs them: the header
 * names it.
 *
 * @internal
 */
export function withComponentHeaderButtons<T>(
  layout: ComponentInfo<T> | undefined,
  components: Record<string, ComponentInfoSerialized>,
): ComponentInfo<T> | undefined {
  const placed = Object.entries(components).flatMap(([id, component]) =>
    componentHeaderButtons(id, component),
  );
  if (!layout || placed.length === 0) return layout;
  const options = (layout.options ?? {}) as {
    headerActions?: PageHeaderButtonSerialized[];
  };
  return {
    ...layout,
    options: {
      ...options,
      headerActions: [...(options.headerActions ?? []), ...placed],
    } as T,
  };
}
