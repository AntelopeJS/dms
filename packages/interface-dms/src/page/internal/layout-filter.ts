import { applyButtonAvailability } from "../../base/internal/button-availability";
import type {
  PageHeaderButtonDeclared,
  PageHeaderButtonSerialized,
} from "../../base/internal/layouts";
import type { CustomButtonSerialized } from "../../base/types/custom-button";
import type { RowActionConfigSerialized } from "../../base/types/row-action";
import type {
  ComponentInfo,
  ComponentFilterContext,
  ComponentInfoSerialized,
} from "../../component";
import { childComponentClientId } from "./component-target";
import {
  holdsPermissionGate,
  isPermissionGated,
} from "../../internal/permission-gate";

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
 * The header buttons a component and its descendants place there, each named
 * by the id the frontend renders it under: a table view nested in a tab or a
 * card runs its buttons as one at the root of the page does.
 */
function treeHeaderButtons(
  clientId: string,
  component: ComponentInfoSerialized,
): PageHeaderButtonSerialized[] {
  const nested = (component.children ?? []).flatMap((child) =>
    treeHeaderButtons(
      childComponentClientId(clientId, child.id),
      child.component,
    ),
  );
  return [...componentHeaderButtons(clientId, component), ...nested];
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
    treeHeaderButtons(id, component),
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
