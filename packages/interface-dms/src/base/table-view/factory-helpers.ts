// The helpers the TableView factory chains together: action and display
// serialization, the actions it declares, and its page-mode form pages (their
// slugs, URLs, redirection and filter defaults).
//
// Split out of factory.ts. The declaration checks live in `./validation`, the
// filter tabs in `./tabs`, the per-request filtering in `./request-filter` and
// the one writing TableView of a controller in `./writer`.

import { ComponentBuilder } from "../../component";
import { type FormBuilder, FormEvents } from "../form-types";
import type {
  ActionTarget,
  ActionTargetSerialized,
} from "../types/action-target";
import type {
  CustomButton,
  CustomButtonSerialized,
} from "../types/custom-button";
import type { RowActionConfig, RowActionRule } from "../types/row-action";
import { LIST_ACTION, SELECT_ACTION, VIEW_ACTION } from "./auth";
import { TableViewMeta } from "./meta";
import { assertKnownColumns } from "./validation";
import {
  CARDS_DISPLAY_ID,
  type FormContainerPageConfig,
  type FormContainerPages,
  type FormContainerPageTexts,
  KANBAN_DISPLAY_ID,
  type KanbanOptions,
  type KanbanOptionsSerialized,
  type QueryParamFilters,
  type RouteParamFilters,
  type TableViewCardOptions,
  type TableViewCardOptionsSerialized,
  type TableViewDisplayOption,
  type TableViewDisplayOptionSerialized,
  type TableViewExpandableOptions,
  type TableViewExpandableSerialized,
  type TableViewFormPageUrls,
  type TableViewRowActionOptions,
  type TableViewRowActionOptionsSerialized,
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

/**
 * An action target as the options carry it: a component target is serialized,
 * every other kind is plain data already.
 */
export function serializeActionTarget(
  target: ActionTarget,
): ActionTargetSerialized {
  if (
    target.type === "page" ||
    target.type === "external" ||
    target.type === "api" ||
    target.type === "exportJob"
  ) {
    return target;
  }
  return {
    ...target,
    component: target.component.serializeSync(),
  };
}

/**
 * Custom buttons as the options carry them: their permission and availability
 * stay server-side, applied per request.
 */
export function serializeCustomButtons(
  buttons: CustomButton[] | undefined,
): CustomButtonSerialized[] | undefined {
  return buttons?.map(
    ({ permission: _permission, availability: _availability, ...btn }) => ({
      ...btn,
      target: serializeActionTarget(btn.target),
    }),
  );
}

export function serializeRowActions<T extends Record<string, unknown>>(
  rowActions: TableViewRowActionOptions<T>,
): TableViewRowActionOptionsSerialized {
  return {
    delete: rowActions.delete as boolean | RowActionConfig | undefined,
    archive: rowActions.archive as boolean | RowActionConfig | undefined,
    restore: rowActions.restore as boolean | RowActionConfig | undefined,
    duplicate: rowActions.duplicate as boolean | RowActionConfig | undefined,
    details: rowActions.details as boolean | RowActionConfig | undefined,
    edit: rowActions.edit as boolean | RowActionConfig | undefined,
    copyLink: rowActions.copyLink as boolean | RowActionConfig | undefined,
    add: rowActions.add as boolean | RowActionConfig | undefined,
    hasSelection: rowActions.hasSelection,
    custom: rowActions.custom?.map((action) => ({
      label: action.label,
      icon: action.icon,
      rule: action.rule as RowActionRule | undefined,
      target: serializeActionTarget(action.target),
      isVisible: action.isVisible,
      isDefault: action.isDefault,
      color: action.color,
      variant: action.variant,
      showLabel: action.showLabel,
    })),
  };
}

/** What a table view can do, which decides the actions it declares. */
export interface TableViewCapabilities {
  hasNewForm: boolean;
  hasEditForm: boolean;
  hasViewForm: boolean;
  hasDeleteEndpoint: boolean;
  archiveMode: boolean;
  isExportEnabled: boolean;
}

/**
 * Declare the actions of a table view: list and select, which every table
 * has, then one per form, delete, the archive trio and export, each only when
 * the table view can perform it. A component standing in for a TableView over
 * the same data routes (a custom editor) declares its actions here too, so
 * the routes and the roles carry the same permission ids.
 */
export function registerTableViewActions<T>(
  builder: ComponentBuilder<T>,
  capabilities: TableViewCapabilities,
): void {
  builder.action(LIST_ACTION, {
    title: "$dms.table.action_list",
    icon: "i-ph-list",
  });
  builder.action(SELECT_ACTION, {
    title: "$dms.table.action_select",
    icon: "i-ph-magnifying-glass",
    description: "$dms.table.action_select_description",
    defaultGranted: true,
  });
  if (capabilities.hasNewForm) {
    builder.action("add", {
      title: "$dms.table.action_add",
      icon: "i-ph-plus",
    });
  }
  if (capabilities.hasEditForm) {
    builder.action("edit", {
      title: "$dms.table.action_edit",
      icon: "i-ph-pencil",
    });
  }
  if (capabilities.hasViewForm) {
    builder.action(VIEW_ACTION, {
      title: "$dms.table.action_view",
      icon: "i-ph-eye",
    });
  }
  if (capabilities.hasDeleteEndpoint) {
    builder.action("delete", {
      title: "$dms.table.action_delete",
      icon: "i-ph-trash",
    });
  }
  if (capabilities.archiveMode) {
    builder.action("archive", {
      title: "$dms.table.action_archive",
      icon: "i-ph-archive",
    });
    builder.action("restore", {
      title: "$dms.table.action_restore",
      icon: "i-ph-arrow-counter-clockwise",
    });
    builder.action("viewArchived", {
      title: "$dms.table.action_view_archived",
      icon: "i-ph-eye-closed",
    });
  }
  if (capabilities.isExportEnabled) {
    builder.action("export", {
      title: "$dms.table.action_export",
      icon: "i-ph-download-simple",
    });
  }
}

/**
 * The detail band of expandable rows, with its fields normalized to objects
 * or its component serialized. The band shows one or the other: an option
 * giving both, or neither (an editor's schema can), is refused. Every field
 * must name a declared column: its value renders through that column's data
 * type.
 */
export function serializeExpandable(
  controllerName: string,
  meta: TableViewMeta,
  expandable: TableViewExpandableOptions | undefined,
): TableViewExpandableSerialized | undefined {
  if (!expandable) return undefined;
  const behavior = {
    defaultExpanded: expandable.defaultExpanded,
    single: expandable.single,
  };
  if (expandable.component && expandable.fields) {
    throw new Error(
      `TableView expandable on ${controllerName} gives both fields and a component: the component replaces the field list, give one or the other`,
    );
  }
  if (expandable.component) {
    return { ...behavior, component: expandable.component.serializeSync() };
  }
  if (!expandable.fields) {
    throw new Error(
      `TableView expandable on ${controllerName} gives neither fields nor a component to show in the band`,
    );
  }
  const fields = expandable.fields.map((field) =>
    typeof field === "string" ? { key: field } : field,
  );
  assertKnownColumns(
    controllerName,
    meta,
    "expandable fields",
    fields.map(({ key }) => key),
  );
  return { ...behavior, fields, fieldsLabel: expandable.fieldsLabel };
}

/** What `TableView()` serializes its displays from. */
export interface TableViewDisplaySources {
  displays?: TableViewDisplayOption[];
  kanban?: KanbanOptions;
  card?: TableViewCardOptions;
}

/**
 * The card both card displays draw: the table view's `card`, else the kanban's
 * deprecated `cardFields`/`cardComponent` aliases.
 */
function serializeCard({
  card,
  kanban,
}: TableViewDisplaySources): TableViewCardOptionsSerialized | undefined {
  const fields = card?.fields ?? kanban?.cardFields;
  const component = card?.component ?? kanban?.cardComponent;
  if (!fields && !component) return undefined;
  return { fields, component: component?.serializeSync() };
}

/**
 * The `kanban` option is transported to the frontend as a `displays` entry
 * (`{ id: "kanban", options }`), not as a dedicated field; the kanban display
 * reads its options from `context.options` like any other display. The `card`
 * joins the options of both card displays, kanban and cards.
 */
export function serializeTableViewDisplays(
  sources: TableViewDisplaySources,
): TableViewDisplayOptionSerialized[] | undefined {
  const { displays, kanban } = sources;
  const card = serializeCard(sources);
  const serialized: TableViewDisplayOptionSerialized[] =
    displays?.map((display) => ({
      ...display,
      options:
        card && display.id === CARDS_DISPLAY_ID
          ? { ...display.options, card }
          : display.options,
      component: display.component?.serializeSync(),
    })) ?? [];
  if (kanban && !serialized.some((entry) => entry.id === KANBAN_DISPLAY_ID)) {
    const {
      cardFields: _cardFields,
      cardComponent: _cardComponent,
      ...board
    } = kanban;
    const kanbanOptions: KanbanOptionsSerialized = { ...board, card };
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

/** The `formContainer.pages` key of each form kind. */
export const FORM_PAGE_CONFIG_KEYS: Record<
  FormPageKind,
  keyof FormContainerPages
> = { new: "new", edit: "edit", view: "details" };

/** The `formContainer.pages` entry of a form kind. */
export function formPageConfig(
  kind: FormPageKind,
  pages: FormContainerPages | undefined,
): FormContainerPageConfig | undefined {
  return pages?.[FORM_PAGE_CONFIG_KEYS[kind]];
}

/**
 * Title and description of a page-mode form sub-page: its
 * `formContainer.pages` entry, else the generic "New entry" / "Edit entry" /
 * "Entry details" texts.
 */
export function resolveFormPageTexts(
  kind: FormPageKind,
  pages?: FormContainerPages,
): Required<FormContainerPageTexts> {
  const definition = FORM_PAGE_DEFINITIONS[kind];
  const page = formPageConfig(kind, pages);
  return {
    displayName: page?.displayName || definition.displayName,
    description: page?.description || definition.description,
  };
}

export const FORM_PAGE_KINDS = Object.keys(
  FORM_PAGE_DEFINITIONS,
) as FormPageKind[];

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
    formPageConfig(kind, pages)?.urlSlug ||
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
