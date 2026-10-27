import { ComponentBuilder } from "../../../component";
import { type FormBuilder, FormEvents } from "../../form-types";
import { serializeActionTarget } from "../../types/internal/action-target";
import type {
  CustomButton,
  CustomButtonSerialized,
} from "../../types/custom-button";
import { serializeActionConfirm } from "../../internal/confirm-dialog";
import type {
  AddRowActionConfig,
  BulkRowActionConfig,
  CustomRowAction,
  CustomRowActionSerialized,
  RowActionConfigSerialized,
  RowActionRule,
} from "../../types/row-action";
import {
  LIST_ACTION,
  SELECT_ACTION,
  VIEW_ACTION,
  VIEW_ARCHIVED_ACTION,
} from "./auth";
import { TableViewMeta } from "../meta";
import { assertKnownColumns, offeredDisplays } from "./validation";
import {
  CARDS_DISPLAY_ID,
  type FormContainerPageConfig,
  type FormContainerPages,
  type FormContainerPageTexts,
  GROUPED_DISPLAY_ID,
  type GroupedOptions,
  KANBAN_DISPLAY_ID,
  type KanbanOptions,
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
} from "../options";
import { TableViewFunctions } from "../factory-helpers";

/** @internal */
export type FormPageKind = keyof TableViewFormPageUrls;

interface FormRedirectParams {
  url: string;
  preserveQuery?: string[];
}

/** @internal */
export function applyFormRedirect<T>(
  formBuilder: ComponentBuilder<T>,
  redirectUrl: string,
  preserveQuery?: string[],
): void {
  const params: FormRedirectParams = {
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
 * Custom buttons as the options carry them: their permission and availability
 * stay server-side, applied per request.
 *
 * @internal
 */
export function serializeCustomButtons(
  buttons: CustomButton[] | undefined,
): CustomButtonSerialized[] | undefined {
  return buttons?.map(
    ({
      permission: _permission,
      permissionId: _permissionId,
      availability: _availability,
      confirm,
      ...btn
    }) => {
      const served: CustomButtonSerialized = {
        ...btn,
        target: serializeActionTarget(btn.target),
      };
      if (confirm) served.confirm = serializeActionConfirm(confirm);
      return served;
    },
  );
}

/** A built-in row action as the options carry it: its confirmation serialized. */
function serializeRowActionConfig<T extends Record<string, unknown>>(
  config: boolean | BulkRowActionConfig<T> | AddRowActionConfig<T> | undefined,
): boolean | RowActionConfigSerialized | undefined {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Boolean shorthand.
  if (config === undefined || typeof config === "boolean") return config;
  const { confirm, rule, ...rest } = config;
  const served: RowActionConfigSerialized = rest;
  if (rule) served.rule = rule as RowActionRule;
  if (confirm) served.confirm = serializeActionConfirm(confirm);
  return served;
}

/** A custom row action as the options carry it. */
function serializeCustomRowAction<T extends Record<string, unknown>>(
  action: CustomRowAction<T>,
): CustomRowActionSerialized {
  const served: CustomRowActionSerialized = {
    id: action.id,
    label: action.label,
    icon: action.icon,
    rule: action.rule as RowActionRule | undefined,
    target: serializeActionTarget(action.target),
    isVisible: action.isVisible,
    isDefault: action.isDefault,
    color: action.color,
    variant: action.variant,
    showLabel: action.showLabel,
    bulk: action.bulk,
    deepLink: action.deepLink,
  };
  if (action.confirm) served.confirm = serializeActionConfirm(action.confirm);
  return served;
}

/**
 * The row actions as the options carry them to the client.
 *
 * @internal
 */
export function serializeRowActions<T extends Record<string, unknown>>(
  rowActions: TableViewRowActionOptions<T>,
): TableViewRowActionOptionsSerialized {
  return {
    delete: serializeRowActionConfig(rowActions.delete),
    archive: serializeRowActionConfig(rowActions.archive),
    restore: serializeRowActionConfig(rowActions.restore),
    duplicate: serializeRowActionConfig(rowActions.duplicate),
    details: serializeRowActionConfig(rowActions.details),
    edit: serializeRowActionConfig(rowActions.edit),
    copyLink: serializeRowActionConfig(rowActions.copyLink),
    add: serializeRowActionConfig(rowActions.add),
    hasSelection: rowActions.hasSelection,
    custom: rowActions.custom?.map(serializeCustomRowAction),
    menuLabel: rowActions.menuLabel,
  };
}

/**
 * What a table view can do, which decides the actions it declares.
 *
 * @internal
 */
export interface TableViewCapabilities {
  hasNewForm: boolean;
  hasEditForm: boolean;
  hasViewForm: boolean;
  hasDeleteEndpoint: boolean;
  archiveMode: boolean;
  isExportEnabled: boolean;
  /**
   * Whether the add, edit and view forms open as pages of their own, reached
   * by URL, rather than over the table (a drawer, a modal, a side panel).
   */
  formsArePages: boolean;
}

/**
 * The dependencies of each action of a table view, by action id. An action
 * depends on the permission guarding what it reads. The edit form loads its
 * row through the view route: without the view it opens empty, and a value
 * saved from it replaces one it never showed. An export writes its own
 * `@Exported` fields, which may go past the columns the list shows. A delete
 * reads nothing of the row.
 *
 * An action only reached from the table's rows also depends on the `list`
 * that shows them: delete, the archive trio, export, and a form opening over
 * the table. A form opening as its own page is reached by URL — a link in a
 * notification leads a member to the one record they may edit — and does not.
 * `select` serves the relation pickers of other pages and depends on nothing;
 * `restore` is pressed from the archived rows, so it depends on
 * `viewArchived`, and through it on `list`.
 */
function tableViewActionDependencies(capabilities: TableViewCapabilities) {
  const listed = [LIST_ACTION];
  const formListed = capabilities.formsArePages ? [] : listed;
  const readsRow = capabilities.hasViewForm ? [VIEW_ACTION] : [];
  const orUndefined = (ids: string[]) => (ids.length > 0 ? ids : undefined);
  return {
    add: orUndefined(formListed),
    edit: orUndefined([...readsRow, ...formListed]),
    [VIEW_ACTION]: orUndefined(formListed),
    delete: listed,
    archive: listed,
    restore: [VIEW_ARCHIVED_ACTION],
    [VIEW_ARCHIVED_ACTION]: listed,
    export: [...readsRow, ...listed],
  };
}

/**
 * Declare the actions of a table view: list and select, which every table
 * has, then one per form, delete, the archive trio and export, each only when
 * the table view can perform it. A component standing in for a TableView over
 * the same data routes (a custom editor) declares its actions here too, so
 * the routes and the roles carry the same permission ids.
 *
 * @internal
 */
export function registerTableViewActions<T>(
  builder: ComponentBuilder<T>,
  capabilities: TableViewCapabilities,
): void {
  const dependencies = tableViewActionDependencies(capabilities);
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
      dependencies: dependencies.add,
    });
  }
  if (capabilities.hasEditForm) {
    builder.action("edit", {
      title: "$dms.table.action_edit",
      icon: "i-ph-pencil",
      dependencies: dependencies.edit,
    });
  }
  if (capabilities.hasViewForm) {
    builder.action(VIEW_ACTION, {
      title: "$dms.table.action_view",
      icon: "i-ph-eye",
      dependencies: dependencies[VIEW_ACTION],
    });
  }
  if (capabilities.hasDeleteEndpoint) {
    builder.action("delete", {
      title: "$dms.table.action_delete",
      icon: "i-ph-trash",
      dependencies: dependencies.delete,
    });
  }
  if (capabilities.archiveMode) {
    builder.action("archive", {
      title: "$dms.table.action_archive",
      icon: "i-ph-archive",
      dependencies: dependencies.archive,
    });
    builder.action("restore", {
      title: "$dms.table.action_restore",
      icon: "i-ph-arrow-counter-clockwise",
      dependencies: dependencies.restore,
    });
    builder.action(VIEW_ARCHIVED_ACTION, {
      title: "$dms.table.action_view_archived",
      icon: "i-ph-eye-closed",
      dependencies: dependencies[VIEW_ARCHIVED_ACTION],
    });
  }
  if (capabilities.isExportEnabled) {
    builder.action("export", {
      title: "$dms.table.action_export",
      icon: "i-ph-download-simple",
      dependencies: dependencies.export,
    });
  }
}

/**
 * The detail band of expandable rows, with its fields normalized to objects
 * or its component serialized. The band shows one or the other: an option
 * giving both, or neither (an editor's schema can), is refused. Every field
 * must name a declared column: its value renders through that column's data
 * type.
 *
 * @internal
 */
export function serializeExpandable(
  controllerName: string,
  meta: Pick<TableViewMeta, "columns">,
  expandable: TableViewExpandableOptions | undefined,
): TableViewExpandableSerialized | undefined {
  if (!expandable) return undefined;
  const behavior = {
    defaultExpanded: expandable.defaultExpanded,
    single: expandable.single,
    lazyLoad: expandable.lazyLoad,
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
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- String shorthand.
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

/**
 * What `TableView()` serializes its displays from.
 *
 * @internal
 */
export interface TableViewDisplaySources {
  displays?: TableViewDisplayOption[];
  kanban?: KanbanOptions;
  grouped?: GroupedOptions;
  card?: TableViewCardOptions;
}

/** The card both card displays draw: the table view's `card`. */
function serializeCard({
  card,
}: TableViewDisplaySources): TableViewCardOptionsSerialized | undefined {
  if (
    !card?.fields &&
    !card?.component &&
    !card?.minWidth &&
    !card?.skeletonHeight
  )
    return undefined;
  const serialized: TableViewCardOptionsSerialized = {
    fields: card.fields,
    component: card.component?.serializeSync(),
  };
  if (card.minWidth) serialized.minWidth = card.minWidth;
  if (card.skeletonHeight) serialized.skeletonHeight = card.skeletonHeight;
  return serialized;
}

/** The options a built-in display takes from the table view's own options. */
type BuiltinDisplayOptions = (
  sources: TableViewDisplaySources,
  card: TableViewCardOptionsSerialized | undefined,
) => TableViewDisplayOptionSerialized["options"];

// oxlint-disable-next-line anti-slop/no-known-value-widening -- Dynamic display ids.
const BUILTIN_DISPLAY_OPTIONS: Record<string, BuiltinDisplayOptions> = {
  [CARDS_DISPLAY_ID]: (_sources, card) => (card ? { card } : undefined),
  [KANBAN_DISPLAY_ID]: ({ kanban }, card) => {
    if (!kanban) return undefined;
    return { ...kanban, card };
  },
  [GROUPED_DISPLAY_ID]: ({ grouped }) => (grouped ? { ...grouped } : undefined),
};

/**
 * The `kanban` and `grouped` options are transported to the frontend as
 * `displays` entries (`{ id: "kanban", options }`), not as dedicated fields;
 * those displays read their options from `context.options` like any other.
 * The `card` joins the options of both card displays, kanban and cards. The
 * list is the one the table view offers: `displays`, else the table alone.
 *
 * @internal
 */
export function serializeTableViewDisplays(
  sources: TableViewDisplaySources,
): TableViewDisplayOptionSerialized[] {
  const card = serializeCard(sources);
  return offeredDisplays(sources).map((display) => {
    const builtin = BUILTIN_DISPLAY_OPTIONS[display.id]?.(sources, card);
    return {
      ...display,
      options: builtin ? { ...display.options, ...builtin } : display.options,
      component: display.component?.serializeSync(),
    };
  });
}

/**
 * What a page-mode form sub-page is, beyond the form it carries.
 *
 * @internal
 */
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

/** @internal */
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

/**
 * The `formContainer.pages` key of each form kind.
 *
 * @internal
 */
export const FORM_PAGE_CONFIG_KEYS: Record<
  FormPageKind,
  keyof FormContainerPages
> = { new: "new", edit: "edit", view: "details" };

/**
 * The `formContainer.pages` entry of a form kind.
 *
 * @internal
 */
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
 *
 * @internal
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

/** @internal */
// SAFETY: Only FormPageKind keys.
export const FORM_PAGE_KINDS = Object.keys(
  FORM_PAGE_DEFINITIONS,
) as FormPageKind[];

/**
 * Append a form page slug to the slug of the page carrying the table view.
 *
 * @internal
 */
export function joinPageSlug(pageSlug: string, slug: string): string {
  return `${pageSlug}/${slug}`.replace(/\/+/g, "/");
}

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
 *
 * @internal
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
 *
 * @internal
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
 *
 * @internal
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

/**
 * The URL filters of a table view, which its forms submit as defaults.
 *
 * @internal
 */
export interface TableViewUrlFilters {
  queryParamFilters?: QueryParamFilters;
  routeParamFilters?: RouteParamFilters;
}

/**
 * A form page route, and the slug of the page carrying its table view.
 *
 * @internal
 */
export interface FormRouteFrame {
  pageSlug: string;
  formSlug: string;
}

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
 *
 * @internal
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
 *
 * @internal
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
 *
 * @internal
 */
export function applyFormPageSubmitDefaults(
  form: FormBuilder,
  filters: TableViewUrlFilters,
  frame: FormRouteFrame,
): void {
  const submitDefaults = buildFilterSubmitDefaults(filters, frame);
  if (submitDefaults) form.mergeOptions({ submitDefaults });
}
