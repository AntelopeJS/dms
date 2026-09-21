// The helpers the TableView factory chains together: form redirection, custom
// button permissions, controller rules, kanban column eligibility and display
// serialization.
//
// Split out of factory.ts.

import { ComponentBuilder } from "../../component";
import { HasPermission } from "../../permissions";
import { getDataTypeId } from "../data-types";
import { FormEvents } from "../form-types";
import type {
  CustomButton,
  CustomButtonSerialized,
} from "../types/custom-button";
import type { RowActionConfig, RowActionRule } from "../types/row-action";
import { TableViewMeta } from "./meta";
import {
  type FormContainerPages,
  KANBAN_DISPLAY_ID,
  type KanbanOptions,
  type KanbanOptionsSerialized,
  type TableViewDisplayOption,
  type TableViewDisplayOptionSerialized,
  type TableViewFormPageUrls,
} from "./options";

type FormPageKind = keyof TableViewFormPageUrls;

export namespace TableViewEvents {
  export const ROW_CLICK = "DmsComponent.TableView.RowClick";
  export const ROW_SELECT = "DmsComponent.TableView.RowSelect";
  export const ROW_DELETE = "DmsComponent.TableView.RowDelete";
  export const ROW_ADD = "DmsComponent.TableView.RowAdd";
  export const ROW_EDIT = "DmsComponent.TableView.RowEdit";
  export const FILTER_CHANGE = "DmsComponent.TableView.FilterChange";
  export const SORT_CHANGE = "DmsComponent.TableView.SortChange";
  export const EXPORT = "DmsComponent.TableView.Export";
}

export namespace TableViewFunctions {
  export const CUSTOM_PAGE_FORM_SUCCESS =
    "DmsComponent.TableView.CustomPageFormSuccess";
}

export function applyFormRedirect<T>(
  formBuilder: ComponentBuilder<T>,
  redirectUrl: string,
  preserveQuery?: string[],
): void {
  // `preserveQuery` is set only when there is something to preserve, so the
  // params carry no key for it otherwise.
  const params: { url: string; preserveQuery?: string[] } = {
    url: redirectUrl,
  };
  if (preserveQuery && preserveQuery.length > 0) {
    params.preserveQuery = preserveQuery;
  }
  formBuilder.watch(
    FormEvents.SUBMIT_SUCCESS,
    TableViewFunctions.CUSTOM_PAGE_FORM_SUCCESS,
    { params },
  );
}

export function applyPermissionToAction(
  hasPermission: boolean,
  actionConfig: boolean | RowActionConfig | undefined,
): boolean | RowActionConfig | undefined {
  if (!hasPermission) {
    return false;
  }
  return typeof actionConfig === "undefined" ? true : actionConfig;
}

function resolveCustomButtonPermissionId(
  permission: CustomButton["permission"],
  componentPermissionId: string,
): string | undefined {
  if (typeof permission === "string") {
    return `${componentPermissionId}.${permission}`;
  }
  return permission?.permissionId;
}

// Buttons declaring a permission the caller lacks are stripped from the
// serialized options; a declared permission that cannot be resolved to an id
// (e.g. an action on a page that never registered) fails closed.
export async function filterCustomButtonsByPermission(
  permissions: Set<string>,
  declaredButtons: CustomButton[] | undefined,
  serializedButtons: CustomButtonSerialized[] | undefined,
  componentPermissionId: string,
): Promise<CustomButtonSerialized[] | undefined> {
  if (!declaredButtons || !serializedButtons) {
    return serializedButtons;
  }
  const kept: CustomButtonSerialized[] = [];
  for (const [index, serialized] of serializedButtons.entries()) {
    const declaredPermission = declaredButtons[index]?.permission;
    if (declaredPermission === undefined) {
      kept.push(serialized);
      continue;
    }
    const permissionId = resolveCustomButtonPermissionId(
      declaredPermission,
      componentPermissionId,
    );
    if (permissionId && (await HasPermission(permissions, permissionId))) {
      kept.push(serialized);
    }
  }
  return kept;
}

// Row action rules are registered once per controller but enforced server-side
// for every table view on that controller; expose them to pages that did not
// declare their own rule so their UI matches what the server will accept.
export function mergeControllerRule(
  actionConfig: boolean | RowActionConfig | undefined,
  rule: RowActionRule | undefined,
): boolean | RowActionConfig | undefined {
  if (!rule || !actionConfig) {
    return actionConfig;
  }
  if (actionConfig === true) {
    return { isEnabled: true, rule };
  }
  if (!actionConfig.rule) {
    return { ...actionConfig, rule };
  }
  return actionConfig;
}

interface KanbanGroupColumnType {
  options?: { multiple?: boolean };
}

const KANBAN_GROUP_TYPE_ELIGIBILITY: Record<
  string,
  (type: KanbanGroupColumnType) => boolean
> = {
  select: (type) => !type.options?.multiple,
  boolean: () => true,
  status: () => true,
};

export function validateKanbanField(
  controllerName: string,
  meta: TableViewMeta,
  groupByField: string,
): void {
  const groupColumn = meta.columns[groupByField];
  if (!groupColumn) {
    throw new Error(
      `TableView kanban groupByField on ${controllerName} references unknown column "${groupByField}"`,
    );
  }
  const typeId = getDataTypeId(groupColumn.type);
  const isEligible =
    typeId !== undefined &&
    KANBAN_GROUP_TYPE_ELIGIBILITY[typeId]?.(
      groupColumn.type as KanbanGroupColumnType,
    );
  if (!isEligible) {
    throw new Error(
      `TableView kanban groupByField "${groupByField}" on ${controllerName} must be a non-multiple SelectType, a BooleanType or a StatusType column (got "${typeId}")`,
    );
  }
}

/**
 * The `kanban` option is transported to the frontend as a `displays` entry
 * (`{ id: "kanban", options }`), not as a dedicated field; the kanban display
 * reads its options from `context.options` like any other display.
 */
export function serializeTableViewDisplays(
  displays: TableViewDisplayOption[] | undefined,
  kanban: KanbanOptions | undefined,
): TableViewDisplayOptionSerialized[] | undefined {
  const serialized: TableViewDisplayOptionSerialized[] =
    displays?.map((display) => ({
      ...display,
      component: display.component?.serializeSync(),
    })) ?? [];
  if (kanban && !serialized.some((entry) => entry.id === KANBAN_DISPLAY_ID)) {
    const kanbanOptions: KanbanOptionsSerialized = {
      ...kanban,
      cardComponent: kanban.cardComponent?.serializeSync(),
    };
    serialized.push({
      id: KANBAN_DISPLAY_ID,
      // The serialised options and a bare dictionary do not overlap, so this
      // cannot be one assertion; the display registry reads it by key.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions
      options: kanbanOptions as unknown as Record<string, unknown>,
    });
  }
  return serialized.length > 0 ? serialized : undefined;
}

/**
 * Whether the component sits below a page component rather than being one.
 * Permission ids are the page's `fullId` followed by the path of keys leading
 * to the component, so a nested one keeps a separator in what remains.
 */
export function isNestedComponent(
  permissionId: string,
  pageFullId: string,
): boolean {
  const prefix = `${pageFullId}.`;
  if (!permissionId.startsWith(prefix)) return false;
  return permissionId.slice(prefix.length).includes(".");
}

/** Slug a page-mode form page takes when the table view declares none. */
export const FORM_PAGE_DEFAULT_SLUGS: Record<FormPageKind, string> = {
  new: "new",
  edit: ":id/edit",
  view: ":id/view",
};

/** Append a form page slug to the slug of the page carrying the table view. */
export function joinPageSlug(pageSlug: string, slug: string): string {
  return `${pageSlug}/${slug}`.replace(/\/+/g, "/");
}

// A slug starting with "/" addresses a page of its own and is navigated
// verbatim, query string included; leading ".." segments each drop one segment
// of the carrying page. Registration joins the slug as it stands instead —
// these two forms name a page the table view does not register.
function toFormPageUrl(pageSlug: string, slug: string): string {
  if (slug.startsWith("/")) return slug;
  const parts = slug.split("/");
  let parentCount = 0;
  while (parentCount < parts.length && parts[parentCount] === "..") {
    parentCount++;
  }
  const segments = pageSlug.replace(/\/$/, "").split("/");
  return joinPageSlug(
    segments.slice(0, segments.length - parentCount).join("/"),
    parts.slice(parentCount).join("/"),
  );
}

/**
 * The URL each page-mode form is reached at, whether or not the table view
 * registers a page for it: a `customPage` entry points at a hand-written page,
 * and a nested table view registers nothing at all, yet both are navigated to.
 */
export function buildFormPageUrls(
  pageSlug: string,
  pages?: FormContainerPages,
): TableViewFormPageUrls {
  const urls = {} as TableViewFormPageUrls;
  for (const [kind, defaultSlug] of Object.entries(FORM_PAGE_DEFAULT_SLUGS)) {
    urls[kind as FormPageKind] = toFormPageUrl(
      pageSlug,
      pages?.[kind as FormPageKind]?.urlSlug || defaultSlug,
    );
  }
  return urls;
}
