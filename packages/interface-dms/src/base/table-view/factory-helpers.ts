// The helpers the TableView factory chains together: form redirection, custom
// button permissions, controller rules, kanban column eligibility and display
// serialization.
//
// Split out of factory.ts.

import { ComponentBuilder } from "../../component";
import { HasPermission } from "../../permissions";
import { getDataTypeId } from "../data-types";
import { type FormBuilder, FormEvents } from "../form-types";
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
  type QueryParamFilters,
  type RouteParamFilters,
  type TableViewDisplayOption,
  type TableViewDisplayOptionSerialized,
  type TableViewFormPageUrls,
} from "./options";

export type FormPageKind = keyof TableViewFormPageUrls;

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

/** What a page-mode form sub-page is, beyond the form it carries. */
export interface FormPageDefinition {
  /** Slug it takes below the key of its table view, when none is declared. */
  defaultSlug: string;
  displayName: string;
  description: string;
  /** Table view action whose permission guards the sub-page. */
  action: string;
  /** Whether submitting the form sends the user back to the table. */
  redirectsOnSubmit: boolean;
  /** Whether the form submits the fields the table view filters on. */
  submitsFilterDefaults: boolean;
}

export const FORM_PAGE_DEFINITIONS: Record<FormPageKind, FormPageDefinition> = {
  new: {
    defaultSlug: "new",
    displayName: "$dms.table.new_item",
    description: "$dms.table.new_item_description",
    action: "add",
    redirectsOnSubmit: true,
    submitsFilterDefaults: true,
  },
  edit: {
    defaultSlug: ":id/edit",
    displayName: "$dms.table.edit_item",
    description: "$dms.table.edit_item_description",
    action: "edit",
    redirectsOnSubmit: true,
    submitsFilterDefaults: true,
  },
  view: {
    defaultSlug: ":id/view",
    displayName: "$dms.table.view_item",
    description: "$dms.table.view_item_description",
    action: "view",
    redirectsOnSubmit: false,
    submitsFilterDefaults: false,
  },
};

export const FORM_PAGE_KINDS = Object.keys(
  FORM_PAGE_DEFINITIONS,
) as FormPageKind[];

/** The kinds addressing one row, whose slug therefore has to carry an `:id`. */
export const ROW_SCOPED_FORM_PAGE_KINDS: FormPageKind[] = ["edit", "view"];

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
 * The key identifying a table view among the components of its page: the last
 * segment of its permission id relative to the page's `fullId`.
 *
 * Form routes are named after it rather than after the page, so two table views
 * on one page get URLs of their own; the *simple* key rather than the whole
 * component path, so the URL stays readable and survives the layout being
 * reorganised around the table view.
 *
 * @param permissionId Permission id of the table view
 * @param pageFullId `fullId` of the page carrying it
 */
export function formRouteKey(permissionId: string, pageFullId: string): string {
  const prefix = `${pageFullId}.`;
  const path = permissionId.startsWith(prefix)
    ? permissionId.slice(prefix.length)
    : "";
  const key = path.split(".").pop();
  if (!key) {
    throw new Error(
      `TableView permission id "${permissionId}" names no component of page "${pageFullId}": its form routes have no key to be named after.`,
    );
  }
  return key;
}

/**
 * The slug a page-mode form page takes, relative to the page carrying the table
 * view.
 *
 * A declared `urlSlug` is full control — it is taken as it stands, no key
 * segment inserted, which is both what every existing declaration already meant
 * and the escape hatch for anyone wanting a specific URL.
 */
export function formPageSlug(
  kind: FormPageKind,
  routeKey: string,
  pages?: FormContainerPages,
): string {
  return (
    pages?.[kind]?.urlSlug ||
    `${routeKey}/${FORM_PAGE_DEFINITIONS[kind].defaultSlug}`
  );
}

/**
 * The URL each page-mode form is reached at, whether or not the table view
 * registers a page for it: a `customPage` entry points at a hand-written page
 * and is navigated to all the same.
 */
export function buildFormPageUrls(
  pageSlug: string,
  routeKey: string,
  pages?: FormContainerPages,
): TableViewFormPageUrls {
  const urls = {} as TableViewFormPageUrls;
  for (const kind of FORM_PAGE_KINDS) {
    urls[kind] = toFormPageUrl(pageSlug, formPageSlug(kind, routeKey, pages));
  }
  return urls;
}

/** The URL filters of a table view, which its forms submit as defaults. */
export interface TableViewUrlFilters {
  queryParamFilters?: QueryParamFilters;
  routeParamFilters?: RouteParamFilters;
}

/** A form page route, and the slug of the page carrying its table view. */
export interface FormRouteFrame {
  pageSlug: string;
  formSlug: string;
}

// Mirrors how the frontend reads a route pattern (extractRouteParams): one
// placeholder per segment, in pattern order.
function slugPlaceholders(slug: string): string[] {
  return slug
    .split("/")
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.substring(1));
}

const countOccurrences = (names: string[], name: string): number =>
  names.filter((candidate) => candidate === name).length;

/**
 * The token reading, on a form page, the route parameter `name` of the page
 * carrying the table view — the value its `routeParamFilters` filter on.
 *
 * The bare name holds the last occurrence of a repeated placeholder, which on
 * a form route is the form's own (`/workspaces/:id/invoiceTable/:id/edit`:
 * the row id). The page's placeholders precede the form's, so the one the
 * table view reads — the last of the page slug — is addressed by its number.
 * Numbered keys exist only for repeated names, hence the bare name otherwise.
 */
function pageParamToken(name: string, frame?: FormRouteFrame): string {
  if (!frame) return `{{params.${name}}}`;
  const occurrence = countOccurrences(slugPlaceholders(frame.pageSlug), name);
  const total = countOccurrences(slugPlaceholders(frame.formSlug), name);
  return occurrence > 0 && total > 1
    ? `{{params.${name}:${occurrence}}}`
    : `{{params.${name}}}`;
}

/**
 * Default the filtered fields from the URL tokens that `queryParamFilters` /
 * `routeParamFilters` apply to the table, so a form opened from a filtered view
 * inherits that context. The form resolves these tokens at submit time and
 * drops any that are absent.
 *
 * @param filters URL filters of the table view
 * @param frame Route of the form page the form is registered under; without
 * one, the form renders on the page carrying the table view
 */
export function buildFilterSubmitDefaults(
  filters: TableViewUrlFilters,
  frame?: FormRouteFrame,
): Record<string, string> | undefined {
  const defaults: Record<string, string> = {};
  for (const [param, filter] of Object.entries(
    filters.queryParamFilters ?? {},
  )) {
    defaults[filter.field] = `{{query.${param}}}`;
  }
  for (const [param, filter] of Object.entries(
    filters.routeParamFilters ?? {},
  )) {
    defaults[filter.field] = pageParamToken(param, frame);
  }
  return Object.keys(defaults).length > 0 ? defaults : undefined;
}

/**
 * Re-resolve the filter defaults of a form for the page it is registered as.
 *
 * The form was built for the page carrying the table view — where the table
 * view embeds it, and where `{{params.<name>}}` is the parameter it filters
 * on. On a form route repeating that name, the bare name is shadowed by the
 * form's own placeholder.
 */
export function applyFormPageSubmitDefaults(
  form: FormBuilder,
  filters: TableViewUrlFilters,
  frame: FormRouteFrame,
): void {
  const submitDefaults = buildFilterSubmitDefaults(filters, frame);
  if (submitDefaults) form.mergeOptions({ submitDefaults });
}
