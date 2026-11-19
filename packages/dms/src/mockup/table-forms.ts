import { Form } from "@antelopejs/interface-dms/base/form-schema";
import type {
  FormField,
  FormFieldOrGroup,
  FormProps,
} from "@antelopejs/interface-dms/base/form-types";
import type {
  ColumnGroupConfig,
  TableViewOptions,
  TableViewRowActionOptions,
  TableViewSourceOptions,
} from "@antelopejs/interface-dms/base/table-view";
import {
  FORM_PAGE_CONFIG_KEYS,
  FORM_PAGE_DEFINITIONS,
  type FormPageKind,
  formPageConfig,
  resolveFormPageTexts,
  serializeRowActions,
} from "@antelopejs/interface-dms/base/table-view/internal/factory-helpers";
import type { FixtureScope } from "./fixtures";
import {
  fixtureSource,
  fixtureUrl,
  parseRows,
  recordUrl,
  rowIdAt,
} from "./fixtures";
import { NavCardGrid } from "@antelopejs/interface-dms/base/nav-card-grid";
import type { JsonObject } from "./model";
import { jsonObjectSchema } from "./model";
import { linkTo, pageLinkTarget, pageLinkUrl } from "./page-links";

type FormContainer = NonNullable<TableViewOptions["formContainer"]>;
type RowActions = Pick<TableViewRowActionOptions, "add" | "edit" | "details">;

/**
 * One form a table opens: the row action opening it, its kind (its key in
 * `formComponents` and `formPages`, which `FORM_PAGE_CONFIG_KEYS` maps to its
 * key in `formContainer.pages`), and whether it opens on a row.
 */
interface FormKind {
  action: keyof RowActions;
  form: FormPageKind;
  onRow: boolean;
}

const FORM_KINDS: readonly FormKind[] = [
  { action: "add", form: "new", onRow: false },
  { action: "edit", form: "edit", onRow: true },
  { action: "details", form: "view", onRow: true },
];

/** Where a mockup opens a table's forms when the spec sets no `formContainer`. */
const DEFAULT_CONTAINER: FormContainer = { type: "modal" };

/** Where `fillFormPageUrl` writes the id of the row a form opens on. */
const ROW_ID_PLACEHOLDER = ":id";

/** The key a table reads a row's id at unless `rowIdKey` names another, which the record route reads too. */
const DEFAULT_ROW_ID_KEY = "_id";

/** The segments of a node's options pointer before the node's own path: `/pages/<index>`, the empty one before the first slash included. */
const PAGE_POINTER_DEPTH = 3;

/** The route parameter of a generated edit or details page: the row's id. */
const ROW_PARAM = "id";

/**
 * The English texts of the generic form page titles and descriptions, which
 * the real `TableView` leaves to the dashboard's locale: the preview draws a
 * page's title as written.
 */
const GENERIC_PAGE_TEXTS: ReadonlyMap<string, string> = new Map([
  ["$dms.table.new_item", "New entry"],
  ["$dms.table.new_item_description", "Fill in its fields, then save."],
  ["$dms.table.edit_item", "Edit entry"],
  ["$dms.table.edit_item_description", "Change its fields, then save."],
  ["$dms.table.view_item", "Entry details"],
  ["$dms.table.view_item_description", "Every field of this entry, read-only."],
]);

/**
 * How a table's form fields group, as `@Column({ group })` and `@ColumnGroup`
 * declare it on a controller.
 */
export interface FormGroups {
  /** The group of each column in one, keyed by column. */
  ofColumn: ReadonlyMap<string, string>;
  /** Each declared group's label, help text, orientation and order, by id. */
  declared: ReadonlyMap<string, ColumnGroupConfig>;
}

/** The table a form belongs to, as its spec writes it and as it was built. */
export interface TableForms {
  rowActions?: RowActions;
  formContainer?: FormContainer;
  columns: TableViewSourceOptions["columns"];
  groups: FormGroups;
  rowIdKey?: string;
  /** The page holding the fixture the table lists, and its key. */
  rows: { pageId: string; key: string };
}

function isOn(action: RowActions[keyof RowActions]): boolean {
  if (action === undefined || action === false) return false;
  return action === true || action.isEnabled !== false;
}

/** A table's fixture routes: its rows, the record of the row a form opens on, and the `&key=` naming the table's `rowIdKey`. */
interface RowRoutes {
  rows: string;
  record: string;
  key: string;
}

/**
 * Where a generated form reads its row and saves, as the real `TableView`'s
 * forms over a controller do: the add form saves a new row, the edit form
 * reads the row and saves it, the details form only reads it.
 */
function formRoutes(form: FormKind["form"], routes: RowRoutes) {
  switch (form) {
    case "new":
      return { submitUrl: routes.rows, kind: "create" as const };
    case "edit":
      return {
        fetchUrl: routes.record,
        submitUrl: `${routes.rows}?id={{params.${ROW_PARAM}}}${routes.key}`,
      };
    case "view":
      return { fetchUrl: routes.record };
  }
}

/**
 * The form a row action opens in a modal or a drawer, built by the real `Form`
 * factory over the table's columns: it reads the row from the fixture's record
 * route and saves to its rows route, which keeps nothing. The details form
 * saves nowhere and draws every field disabled, read-only, as the real details
 * view does. Its methods are left to the form's defaults, `GET` and `PUT`: the
 * preview draws no block naming a method that writes.
 */
function generatedForm(
  kind: FormKind,
  table: TableForms,
  scope: FixtureScope,
  pageOptions?: Pick<FormProps, "backTo" | "redirectOnSuccess">,
) {
  const idKey = table.rowIdKey ?? DEFAULT_ROW_ID_KEY;
  const key = idKey === DEFAULT_ROW_ID_KEY ? "" : `&key=${idKey}`;
  const { pageId, key: fixture } = table.rows;
  const routes: RowRoutes = {
    rows: `${fixtureUrl(scope.name, pageId, fixture)}/rows`,
    record: `${recordUrl(scope.name, pageId, fixture, ROW_PARAM)}${key}`,
    key,
  };
  const readOnly = kind.form === "view";
  const fields = Object.entries(table.columns)
    .filter(([id]) => id !== idKey)
    .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
    .map(([id, column]): FormField => ({
      id,
      label: column.name ?? id,
      type: column.type,
      ...(readOnly && { disabled: true }),
    }));
  return jsonObjectSchema.parse(
    JSON.parse(
      JSON.stringify(
        Form({
          fields: groupedFields(fields, table.groups),
          ...formRoutes(kind.form, routes),
          ...pageOptions,
        }).serializeSync(),
      ),
    ),
  );
}

/**
 * The fields with each group's columns gathered where its first column
 * stands, titled by its `@ColumnGroup`, else by its id, as the real
 * `TableView` builds its forms' fields.
 */
function groupedFields(
  fields: readonly FormField[],
  { ofColumn, declared }: FormGroups,
): FormFieldOrGroup[] {
  const placed = new Set<string>();
  return fields.flatMap((field): FormFieldOrGroup[] => {
    const group = ofColumn.get(field.id);
    if (group === undefined) return [field];
    if (placed.has(group)) return [];
    placed.add(group);
    const config = declared.get(group);
    return [
      {
        id: group,
        label: config?.label ?? group,
        description: config?.description,
        orientation: config?.orientation,
        order: config?.order,
        fields: fields.filter(({ id }) => ofColumn.get(id) === group),
      },
    ];
  });
}

/**
 * The URL of the page a page-mode form opens on, reporting at its `pointer` a
 * form named for a spec page that is not one, or opening on a row whose page
 * has no route to take the row's id. A form whose `formContainer.pages` entry
 * is a spec page (`{ "urlSlug": "page:<id>", "customPage": true }`) opens on
 * it; any other form opens on a page the mockup generates, as the real
 * `TableView` registers one.
 */
function formPageUrl(
  kind: FormKind,
  table: TableForms,
  container: Extract<FormContainer, { type: "page" }>,
  pointer: string,
  scope: FixtureScope,
): string {
  const config = formPageConfig(kind.form, container.pages);
  const at = `${pointer}/formContainer/pages/${FORM_PAGE_CONFIG_KEYS[kind.form]}`;
  const target = pageLinkTarget(config?.urlSlug);
  if (target === undefined && config?.customPage !== true) {
    return generatedPageUrl(kind, table, container, pointer, scope);
  }
  if (target === undefined) {
    scope.issues.push({
      path: `${at}/urlSlug`,
      message: `a custom page form opens on a spec page: set formContainer.pages.${FORM_PAGE_CONFIG_KEYS[kind.form]}.urlSlug to "page:<id>", or drop customPage to have the mockup draw the generated page`,
    });
    return "";
  }
  if (config?.customPage !== true) {
    scope.issues.push({
      path: `${at}/customPage`,
      message:
        "the spec page is the form, as a page the module registers itself: set customPage to true",
    });
  }
  const page = scope.pages.get(target);
  if (kind.onRow && page && page.param === undefined) {
    scope.issues.push({
      path: `${at}/urlSlug`,
      message: `the ${kind.form} form opens on a row: give the page "${target}" a route, ":id"`,
    });
  }
  return linkTo(
    scope,
    target,
    `${at}/urlSlug`,
    kind.onRow ? ROW_ID_PLACEHOLDER : undefined,
  );
}

/** The text of a generated page, as its entry or the generic one gives it, in English. */
function pageText(text: string): string {
  return GENERIC_PAGE_TEXTS.get(text) ?? text;
}

/**
 * The back link above a generated details page's form: one card of the real
 * `NavCardGrid` to the table's page at `list`. The read-only form offers no
 * Cancel, as the add and edit forms do, to go back with.
 */
function backLink(list: string): JsonObject {
  return jsonObjectSchema.parse(
    JSON.parse(
      JSON.stringify(
        NavCardGrid({
          columns: 1,
          items: [
            { title: "Back to the table", icon: "i-ph-arrow-left", to: list },
          ],
        }).serializeSync(),
      ),
    ),
  );
}

/**
 * The viewer's URL of the generated page of `kind`, which holds the generated
 * form over the table's columns and is a sub-page of the table's page. It
 * is told apart by its form kind and the path of the table's node, so a page
 * holding several tables has a page for each, and its id holds a `.`, which
 * no spec page id does. The form goes back to the table's page, as the real
 * form page's `backTo` does, and, once saved, leaves for it as its
 * `redirectOnSuccess` does, unless it only reads.
 */
function generatedPageUrl(
  kind: FormKind,
  table: TableForms,
  container: Extract<FormContainer, { type: "page" }>,
  pointer: string,
  scope: FixtureScope,
): string {
  const node = pointer.split("/").slice(PAGE_POINTER_DEPTH, -1).join("-");
  const id = `${scope.pageId}.${node}.${kind.form}`;
  const list = pageLinkUrl(scope.name, scope.pageId);
  const definition = FORM_PAGE_DEFINITIONS[kind.form];
  const texts = resolveFormPageTexts(kind.form, container.pages);
  const form = generatedForm(kind, table, scope, {
    backTo: list,
    ...(definition.redirectsOnSubmit && { redirectOnSuccess: list }),
  });
  scope.generatedPages.push({
    id,
    title: pageText(texts.displayName),
    description: pageText(texts.description),
    ...(kind.onRow && { route: rowRoute(table, scope) }),
    tree: [
      ...(kind.form === "view" ? [backLink(list)] : []),
      jsonObjectSchema.parse(form),
    ],
  });
  return pageLinkUrl(
    scope.name,
    id,
    kind.onRow ? ROW_ID_PLACEHOLDER : undefined,
  );
}

/** The route of a generated page on a row: its parameter, and the id of the first row of the table's fixture, which it shows while no link names one. */
function rowRoute(table: TableForms, scope: FixtureScope) {
  const source = fixtureSource(scope, table.rows.key);
  const rows = source ? parseRows(source.value) : undefined;
  const sample = rowIdAt(rows?.[0], table.rowIdKey);
  return { param: ROW_PARAM, ...(sample !== undefined && { sample }) };
}

/**
 * The options a table's add, edit and details row actions set, which
 * `TableView.fromSource` leaves off: the actions themselves, where their forms
 * open, and either the forms a modal or a drawer draws or the spec pages a
 * page-mode form opens on. Empty when the table turns none of them on and
 * sets no `formContainer`.
 */
export function tableFormOptions(
  table: TableForms,
  pointer: string,
  scope: FixtureScope,
): JsonObject {
  const kinds = FORM_KINDS.filter((kind) =>
    isOn(table.rowActions?.[kind.action]),
  );
  if (!kinds.length && !table.formContainer) return {};
  const container = table.formContainer ?? DEFAULT_CONTAINER;
  const actions = serializeRowActions({
    add: table.rowActions?.add,
    edit: table.rowActions?.edit,
    details: table.rowActions?.details,
  });
  const options: JsonObject = jsonObjectSchema.parse(
    JSON.parse(
      JSON.stringify({
        rowActions: {
          add: actions.add,
          edit: actions.edit,
          details: actions.details,
        },
        formContainer: container,
      }),
    ),
  );
  if (container.type === "page") {
    const urls = { new: "", edit: "", view: "" };
    for (const kind of kinds) {
      urls[kind.form] = formPageUrl(kind, table, container, pointer, scope);
    }
    return { ...options, formPages: urls };
  }
  const forms: JsonObject = {};
  for (const kind of kinds) {
    forms[kind.form] = generatedForm(kind, table, scope);
  }
  return { ...options, formComponents: forms };
}
