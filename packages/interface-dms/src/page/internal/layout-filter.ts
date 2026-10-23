import { applyButtonAvailability } from "../../base/internal/button-availability";
import type {
  DefaultLayoutSerializedOptions,
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
import { withPageRecord } from "./page-record";
import {
  holdsPermissionGate,
  isPermissionGated,
} from "../../internal/permission-gate";

async function serveHeaderButton(
  declared: PageHeaderButtonDeclared,
  permissions: () => Promise<Set<string>>,
  pagePermissionId: string | undefined,
  context: ComponentFilterContext,
  declaresRecord: boolean,
): Promise<PageHeaderButtonSerialized | undefined> {
  const button = withPageRecord(declared, declaresRecord, context.record);
  if (!button) return undefined;
  const {
    permission: _permission,
    permissionId: _permissionId,
    requiresRecord: _requiresRecord,
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
 * whose `availability` refuses the request are disabled with its reason, or
 * left out when it hides them. The buttons acting on the page's record take
 * its fields, or are left out without it (`context.record`, which
 * `readPageRecord` read); the layout's `record` loader is not served.
 * `loadPermissions` is only called when a button declares a permission. When
 * one declares an `availability`, or the layout reads a record, the layout
 * says which page query it was served for (`headerActionsQuery`,
 * `headerActionsParams`), so the header asks again for another.
 *
 * @internal
 */
export async function filterLayoutHeaderActions<T>(
  layout: ComponentInfo<T> | undefined,
  loadPermissions: () => Promise<Set<string>>,
  context: ComponentFilterContext,
  pagePermissionId: string | undefined,
): Promise<ComponentInfo<T> | undefined> {
  const options = layout?.options as DefaultLayoutSerializedOptions | undefined;
  if (!layout || !options) return layout;
  const { record, ...frame } = options;
  const declaresRecord = record !== undefined;
  const buttons = frame.headerActions;
  if (!buttons) return { ...layout, options: frame as T };
  let loaded: Promise<Set<string>> | undefined;
  const permissions = () => (loaded ??= loadPermissions());
  const served = await Promise.all(
    buttons.map((button) =>
      serveHeaderButton(
        button,
        permissions,
        pagePermissionId,
        context,
        declaresRecord,
      ),
    ),
  );
  const servedOptions: DefaultLayoutSerializedOptions = {
    ...frame,
    headerActions: served.filter((button) => button !== undefined),
  };
  if (declaresRecord || buttons.some((button) => button.availability)) {
    servedOptions.headerActionsQuery = context.query ?? {};
    servedOptions.headerActionsParams = context.params ?? {};
  }
  return { ...layout, options: servedOptions as T };
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
