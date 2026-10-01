// The helpers the TableView factory chains together: form redirection, custom
// button permissions, controller rules, kanban column eligibility and display
// serialization, and the filter-tab route check.
//
// Split out of factory.ts.

import {
  type ControllerClass,
  ControllerMeta,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import type { DataControllerCallbackWithOptions } from "@antelopejs/interface-data-api";
import {
  type ButtonPermission,
  ComponentBuilder,
  type ComponentFilterContext,
  type ComponentInfoSerialized,
  resolveButtonPermissionId,
} from "../../component";
import { GetPermissionId, PageMetadata } from "../../page";
import { HasPermission } from "../../permissions";
import { getDataTypeId } from "../data-types";
import {
  type FormBuilder,
  FormEvents,
  type FormPropsSerialized,
} from "../form-types";
import type {
  CustomButton,
  CustomButtonSerialized,
} from "../types/custom-button";
import type {
  CustomRowAction,
  CustomRowActionSerialized,
  RowActionConfig,
  RowActionRule,
} from "../types/row-action";
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
  type TableViewExpandableOptions,
  type TableViewExpandableSerialized,
  type TableViewFormPageUrls,
  type TableViewQuickFilter,
  type TableViewTab,
  type TableViewTabSerialized,
  TABLE_VIEW_QUERY_KEY,
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

// A declared permission that cannot be resolved to an id (e.g. an action on a
// page that never registered) fails closed.
async function isCustomButtonGranted(
  permissions: Set<string>,
  declared: { permission?: ButtonPermission } | undefined,
  componentPermissionId: string,
): Promise<boolean> {
  if (declared?.permission === undefined) return true;
  const permissionId = resolveButtonPermissionId(
    declared.permission,
    componentPermissionId,
  );
  return !!permissionId && (await HasPermission(permissions, permissionId));
}

// A resolver that throws leaves the button enabled: the operation behind it
// still refuses on its own, and failing the layout would take the page down.
async function applyCustomButtonAvailability(
  declared: CustomButton | undefined,
  serialized: CustomButtonSerialized,
  context: ComponentFilterContext,
): Promise<CustomButtonSerialized> {
  if (!declared?.availability) return serialized;
  try {
    const unavailability = await declared.availability(context);
    if (!unavailability) return serialized;
    return {
      ...serialized,
      disabled: true,
      disabledReason: unavailability.reason,
    };
  } catch (error) {
    Logging.Error(
      `[dms] availability of button "${serialized.id ?? serialized.label}" could not be resolved:`,
      error,
    );
    return serialized;
  }
}

/**
 * The custom buttons served to one request: those whose permission the caller
 * lacks are stripped, and those whose `availability` refuses the request are
 * disabled with its reason.
 */
export async function resolveCustomButtons(
  permissions: Set<string>,
  declaredButtons: CustomButton[] | undefined,
  serializedButtons: CustomButtonSerialized[] | undefined,
  componentPermissionId: string,
  context: ComponentFilterContext,
): Promise<CustomButtonSerialized[] | undefined> {
  if (!declaredButtons || !serializedButtons) {
    return serializedButtons;
  }
  const kept: CustomButtonSerialized[] = [];
  for (const [index, serialized] of serializedButtons.entries()) {
    const declared = declaredButtons[index];
    if (
      !(await isCustomButtonGranted(
        permissions,
        declared,
        componentPermissionId,
      ))
    ) {
      continue;
    }
    kept.push(
      await applyCustomButtonAvailability(declared, serialized, context),
    );
  }
  return kept;
}

/**
 * The custom row actions served to one request: those whose `permission` the
 * caller lacks are stripped, like custom buttons.
 */
export async function resolveCustomRowActions(
  permissions: Set<string>,
  declaredActions: Array<Pick<CustomRowAction, "permission">> | undefined,
  serializedActions: CustomRowActionSerialized[] | undefined,
  componentPermissionId: string,
): Promise<CustomRowActionSerialized[] | undefined> {
  if (!declaredActions || !serializedActions) return serializedActions;
  const kept: CustomRowActionSerialized[] = [];
  for (const [index, serialized] of serializedActions.entries()) {
    if (
      await isCustomButtonGranted(
        permissions,
        declaredActions[index],
        componentPermissionId,
      )
    ) {
      kept.push(serialized);
    }
  }
  return kept;
}

function dataApiLocation(countFrom: ControllerClass | string): string {
  return typeof countFrom === "string"
    ? countFrom
    : GetMetadata(countFrom, ControllerMeta).location;
}

/**
 * Tabs as the options carry them: a link tab's path target and its count
 * location are plain strings already; a page controller target is resolved
 * per request by {@link resolveTableViewTabs}, once pages are registered.
 */
export function serializeTableViewTabs(
  tabs: TableViewTab[] | undefined,
): TableViewTabSerialized[] | undefined {
  return tabs?.map(
    ({ to, countFrom, permission: _permission, filters, ...tab }) => {
      const serialized: TableViewTabSerialized = {
        ...tab,
        filters: to ? [] : (filters ?? []),
      };
      if (typeof to === "string") serialized.to = to;
      if (countFrom) serialized.countFrom = dataApiLocation(countFrom);
      return serialized;
    },
  );
}

const withLeadingSlash = (path: string): string =>
  path.startsWith("/") ? path : `/${path}`;

/**
 * The tabs served to one request: a link tab is kept only for a caller its
 * target admits — the page's own permission, or the declared `permission` —
 * and a page target is resolved to its path and full id. A page that never
 * registered drops its tab.
 */
export async function resolveTableViewTabs(
  permissions: Set<string>,
  declaredTabs: TableViewTab[] | undefined,
  serializedTabs: TableViewTabSerialized[] | undefined,
): Promise<TableViewTabSerialized[] | undefined> {
  if (!declaredTabs || !serializedTabs) return serializedTabs;
  const kept: TableViewTabSerialized[] = [];
  for (const [index, tab] of serializedTabs.entries()) {
    const declared = declaredTabs[index];
    const target = declared?.to;
    if (target && typeof target !== "string") {
      const page = GetMetadata(target, PageMetadata).pageInfo;
      if (!page) continue;
      const permissionId = GetPermissionId(target);
      if (permissionId && !(await HasPermission(permissions, permissionId))) {
        continue;
      }
      kept.push({
        ...tab,
        to: withLeadingSlash(page.fullSlug),
        toPage: page.fullId,
      });
      continue;
    }
    if (
      declared?.permission &&
      !(await HasPermission(permissions, declared.permission))
    ) {
      continue;
    }
    kept.push(tab);
  }
  return kept;
}

/** Throws when a table view option names a column the controller lacks. */
export function assertKnownColumns(
  controllerName: string,
  meta: TableViewMeta,
  option: string,
  keys: string[],
): void {
  for (const key of keys) {
    if (!meta.columns[key]) {
      throw new Error(
        `TableView ${option} on ${controllerName} references unknown column "${key}"`,
      );
    }
  }
}

/** Quick filters must name filterable columns: they filter with `filter_<field>`. */
export function validateQuickFilters(
  controllerName: string,
  meta: TableViewMeta,
  quickFilters: TableViewQuickFilter[] | undefined,
): void {
  for (const { field } of quickFilters ?? []) {
    const column = meta.columns[field];
    if (!column) {
      throw new Error(
        `TableView quickFilters on ${controllerName} references unknown column "${field}"`,
      );
    }
    if (!column.filterable) {
      throw new Error(
        `TableView quickFilters on ${controllerName}: column "${field}" must be filterable`,
      );
    }
  }
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

const TABLE_VIEW_PARAM = new RegExp(`([?&])${TABLE_VIEW_QUERY_KEY}=[^&#]*`);

/**
 * `url` naming the table view a write comes from (`?tableView=`). Replaces a
 * key already there. Plain string work: the URL may hold `{{…}}` tokens the
 * frontend fills in.
 */
export function appendTableViewKey(url: string, tableViewKey: string): string {
  const param = `${TABLE_VIEW_QUERY_KEY}=${encodeURIComponent(tableViewKey)}`;
  if (TABLE_VIEW_PARAM.test(url)) {
    return url.replace(TABLE_VIEW_PARAM, `$1${param}`);
  }
  return `${url}${url.includes("?") ? "&" : "?"}${param}`;
}

/** A serialized form whose submit URL names the table view it belongs to. */
export function withTableViewKeyOnSubmit(
  form: ComponentInfoSerialized<FormPropsSerialized> | undefined,
  tableViewKey: string,
): ComponentInfoSerialized<FormPropsSerialized> | undefined {
  const options = form?.options;
  if (!form || !options?.submitUrl) return form;
  return {
    ...form,
    options: {
      ...options,
      submitUrl: appendTableViewKey(options.submitUrl, tableViewKey),
    },
  };
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
 * The detail band of expandable rows, with its fields normalized to objects
 * and its component serialized. Every field must name a declared column: its
 * value renders through that column's data type.
 */
export function serializeExpandable(
  controllerName: string,
  meta: TableViewMeta,
  expandable: TableViewExpandableOptions | undefined,
): TableViewExpandableSerialized | undefined {
  if (!expandable) return undefined;
  const fields = expandable.fields?.map((field) =>
    typeof field === "string" ? { key: field } : field,
  );
  for (const { key } of fields ?? []) {
    if (!meta.columns[key]) {
      throw new Error(
        `TableView expandable fields on ${controllerName} references unknown column "${key}"`,
      );
    }
  }
  return {
    fields,
    fieldsLabel: expandable.fieldsLabel,
    component: expandable.component?.serializeSync(),
    defaultExpanded: expandable.defaultExpanded,
    single: expandable.single,
  };
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
 * segment of its permission id relative to the page's permission id.
 *
 * Relative to the permission id, not the `fullId`: component permission ids
 * descend from the former, and a page declaring a custom `permission.id` has
 * the two differ.
 *
 * Form routes are named after it rather than after the page, so two table views
 * on one page get URLs of their own; the *simple* key rather than the whole
 * component path, so the URL stays readable and survives the layout being
 * reorganised around the table view.
 *
 * @param permissionId Permission id of the table view
 * @param pagePermissionId Permission id of the page carrying it
 */
export function formRouteKey(
  permissionId: string,
  pagePermissionId: string,
): string {
  const prefix = `${pagePermissionId}.`;
  const path = permissionId.startsWith(prefix)
    ? permissionId.slice(prefix.length)
    : "";
  const key = path.split(".").pop();
  if (!key) {
    throw new Error(
      `TableView permission id "${permissionId}" names no component of the page whose permission id is "${pagePermissionId}": its form routes have no key to be named after.`,
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
 * The token reading, on a form page, an occurrence of the route parameter
 * `name` of the page carrying the table view — by default its last, the value
 * its `routeParamFilters` filter on.
 *
 * The bare name holds the last occurrence of a repeated placeholder, which on
 * a form route is the form's own (`/workspaces/:id/invoiceTable/:id/edit`:
 * the row id). The page's placeholders precede the form's, so the page's
 * occurrence is addressed by its number. Numbered keys exist only for repeated
 * names, hence the bare name otherwise.
 */
function pageParamToken(
  name: string,
  frame?: FormRouteFrame,
  occurrence?: number,
): string {
  if (!frame) return `{{params.${name}}}`;
  const pageOccurrence =
    occurrence ?? countOccurrences(slugPlaceholders(frame.pageSlug), name);
  const total = countOccurrences(slugPlaceholders(frame.formSlug), name);
  return pageOccurrence > 0 && total > 1
    ? `{{params.${name}:${pageOccurrence}}}`
    : `{{params.${name}}}`;
}

/**
 * The URL a form page sends the user back to on submit: the slug of the page
 * carrying the table view, each placeholder replaced by the token reading its
 * value on the form route, which the frontend resolves before navigating
 * (`/workspaces/:id` becomes `/workspaces/{{params.id:1}}` from
 * `/workspaces/:id/invoiceTable/:id/edit`). A slug without placeholder is
 * returned as is.
 */
export function buildFormRedirectUrl(frame: FormRouteFrame): string {
  const seen: Record<string, number> = {};
  return frame.pageSlug
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;
      const name = segment.substring(1);
      seen[name] = (seen[name] ?? 0) + 1;
      return pageParamToken(name, frame, seen[name]);
    })
    .join("/");
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

const COUNT_BATCH_PATH = "count/batch";
const COUNT_BATCH_METHOD = "post";
const EDGE_SLASHES = /^\/+|\/+$/g;

const controllersWarnedForTabCounts = new WeakSet<ControllerClass>();

// Matched on the mounted path and method rather than on the route object: a
// module mounts its own per-context copy of `TableViewRoutes.CountBatch`.
function servesCountBatch(
  endpoints: Record<string, DataControllerCallbackWithOptions>,
): boolean {
  return Object.entries(endpoints).some(
    ([key, entry]) =>
      (entry.endpoint ?? key).replace(EDGE_SLASHES, "") === COUNT_BATCH_PATH &&
      entry.callback.method.toLowerCase() === COUNT_BATCH_METHOD,
  );
}

/**
 * Warn, once per controller, when a table view declares filter tabs but its
 * controller mounts no `POST count/batch` route: every tab counter request
 * would fail. The fix belongs in the controller (mount
 * `countBatch: TableViewRoutes.CountBatch`), so this only reports it.
 */
export function warnIfTabsLackCountBatch(
  controller: ControllerClass,
  location: string,
  hasTabs: boolean,
  endpoints: Record<string, DataControllerCallbackWithOptions>,
): void {
  if (!hasTabs || controllersWarnedForTabCounts.has(controller)) return;
  if (servesCountBatch(endpoints)) return;
  controllersWarnedForTabCounts.add(controller);
  Logging.Warn(
    `[DMS] TableView on "${controller.name}" (${location}) declares filter tabs but its controller mounts no POST ${location}/${COUNT_BATCH_PATH} route: tab counters will fail. Mount \`countBatch: TableViewRoutes.CountBatch\` on the controller.`,
  );
}
