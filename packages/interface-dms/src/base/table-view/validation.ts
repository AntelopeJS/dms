// The declaration checks the TableView factory runs before building anything:
// every option naming a column, a display or a form slug must name one the
// table view actually has.
//
// Split out of factory-helpers.ts.

import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  AccessMode,
  DataAPIMeta,
} from "@antelopejs/interface-data-api/metadata";
import { getDataTypeId } from "../data-types";
import { TableViewMeta } from "./meta";
import {
  type FormContainerPages,
  CARDS_DISPLAY_ID,
  GROUPED_DISPLAY_ID,
  type GroupedOptions,
  KANBAN_DISPLAY_ID,
  type KanbanOptions,
  MAX_TABLE_PAGE_SIZE,
  TABLE_DISPLAY_ID,
  type TableViewDisplayOption,
  type TableViewOptions,
  type TableViewQuickFilter,
  type TableViewTab,
  type TableViewView,
  type TableViewViewsOptions,
} from "./options";

/** `pageSize` is a whole number of rows, from 1 up to {@link MAX_TABLE_PAGE_SIZE}. */
export function validatePageSize(
  controllerName: string,
  pageSize: number | undefined,
): void {
  if (pageSize === undefined) return;
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_TABLE_PAGE_SIZE
  ) {
    throw new Error(
      `TableView pageSize on ${controllerName} must be a whole number from 1 to ${MAX_TABLE_PAGE_SIZE} (got ${pageSize})`,
    );
  }
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

function validateKanbanField(
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
 * The kanban groups on an eligible column and shows declared columns on its
 * cards.
 */
export function validateKanbanOptions(
  controllerName: string,
  meta: TableViewMeta,
  kanban: KanbanOptions | undefined,
): void {
  if (!kanban) return;
  validateKanbanField(controllerName, meta, kanban.groupByField);
  for (const field of kanban.cardFields ?? []) {
    if (!meta.columns[field]) {
      throw new Error(
        `TableView kanban cardFields on ${controllerName} references unknown column "${field}"`,
      );
    }
  }
}

/** Display ids the DMS keeps for its built-in displays. */
const RESERVED_DISPLAY_IDS: readonly string[] = [
  TABLE_DISPLAY_ID,
  KANBAN_DISPLAY_ID,
  CARDS_DISPLAY_ID,
  GROUPED_DISPLAY_ID,
];
// `<module>:<id>`: the module's name, then the display's own id.
const MODULE_DISPLAY_ID = /^[a-z0-9][\w-]*:[\w-]+$/i;

/**
 * A display a table view offers is a built-in one, named by its reserved id
 * and drawn by the DMS (no `component` of its own), or a module's, named
 * `<module>:<id>`.
 */
export function validateDisplayIds(
  controllerName: string,
  displays: TableViewDisplayOption[] | undefined,
): void {
  for (const { id, component } of displays ?? []) {
    if (RESERVED_DISPLAY_IDS.includes(id)) {
      if (component) {
        throw new Error(
          `TableView on ${controllerName} gives the built-in display "${id}" a component: a module display takes an id of its own, "<module>:${id}"`,
        );
      }
      continue;
    }
    if (!MODULE_DISPLAY_ID.test(id)) {
      throw new Error(
        `TableView on ${controllerName} offers display "${id}": a module display is named "<module>:<id>", e.g. "saas:plan-cards"`,
      );
    }
  }
}

/** What a table view's displays are declared from. */
interface DisplayDeclarations {
  kanban?: KanbanOptions;
  grouped?: GroupedOptions;
  displays?: TableViewDisplayOption[];
}

/** The ids of the displays a table view offers. */
export function offeredDisplayIds(options: DisplayDeclarations): Set<string> {
  const { kanban, grouped, displays } = options;
  return new Set<string>([
    TABLE_DISPLAY_ID,
    ...(kanban ? [KANBAN_DISPLAY_ID] : []),
    ...(grouped ? [GROUPED_DISPLAY_ID] : []),
    ...(displays?.map((display) => display.id) ?? []),
  ]);
}

/** The default display must be one the table view offers. */
export function validateDefaultDisplay(
  controllerName: string,
  options: DisplayDeclarations & { defaultDisplay?: string },
): void {
  const { defaultDisplay } = options;
  if (!defaultDisplay) return;
  if (!offeredDisplayIds(options).has(defaultDisplay)) {
    throw new Error(
      `TableView on ${controllerName} defaults to display "${defaultDisplay}" which is not declared in displays`,
    );
  }
}

function isSortableColumn(meta: TableViewMeta, key: string): boolean {
  const fields = GetMetadata(
    meta.target as ControllerClass,
    DataAPIMeta,
  ).fields;
  return fields[key]?.sortable !== undefined;
}

const DAY_GROUPING_TYPE_ID = "date";

/**
 * The grouped display sorts on its column, which must therefore be a sortable
 * column, and a date one to be grouped by day or week.
 */
export function validateGroupedOptions(
  controllerName: string,
  meta: TableViewMeta,
  grouped: GroupedOptions | undefined,
): void {
  if (!grouped) return;
  const { groupByField, by } = grouped;
  const column = meta.columns[groupByField];
  if (!column) {
    throw new Error(
      `TableView grouped groupByField on ${controllerName} references unknown column "${groupByField}"`,
    );
  }
  if (!isSortableColumn(meta, groupByField)) {
    throw new Error(
      `TableView grouped groupByField "${groupByField}" on ${controllerName} must be @Sortable(): the rows are listed sorted on it`,
    );
  }
  const typeId = getDataTypeId(column.type);
  if (by && by !== "value" && typeId !== DAY_GROUPING_TYPE_ID) {
    throw new Error(
      `TableView grouped on ${controllerName} groups "${groupByField}" by ${by}, which needs a DateType column (got "${typeId}")`,
    );
  }
}

const NUMBER_TYPE_ID = "number";

/**
 * A hand-ordered table writes its position column through the edit route:
 * the column must be a writable, sortable number, and the edit action on.
 */
export function validateReorder<T extends Record<string, unknown>>(
  controllerName: string,
  meta: TableViewMeta,
  options: TableViewOptions<T>,
): void {
  const field = options.reorder?.field;
  if (!field) return;
  const where = `TableView reorder field "${field}" on ${controllerName}`;
  const column = meta.columns[field];
  if (!column || getDataTypeId(column.type) !== NUMBER_TYPE_ID) {
    throw new Error(`${where} must be a NumberType column`);
  }
  const fieldMeta = GetMetadata(meta.target as ControllerClass, DataAPIMeta)
    .fields[field];
  if (fieldMeta?.sortable === undefined) {
    throw new Error(
      `${where} must be @Sortable(): the rows are listed sorted on it`,
    );
  }
  if (fieldMeta.mode === AccessMode.ReadOnly) {
    throw new Error(`${where} must be writable: moving a row edits it`);
  }
  if (options.rowActions?.edit === false) {
    throw new Error(`${where} needs the edit action: moving a row edits it`);
  }
}

function assertViewFilters(
  where: string,
  meta: TableViewMeta,
  view: TableViewView,
): void {
  for (const { accessorKey } of view.filters ?? []) {
    if (!meta.columns[accessorKey]?.filterable) {
      throw new Error(
        `${where} filters on "${accessorKey}", which is not a filterable column`,
      );
    }
  }
  for (const { field } of view.sort ?? []) {
    if (!meta.columns[field] || !isSortableColumn(meta, field)) {
      throw new Error(
        `${where} sorts on "${field}", which is not a @Sortable() column`,
      );
    }
  }
  const { visible = [], hidden = [], order = [] } = view.columns ?? {};
  for (const key of [...visible, ...hidden, ...order]) {
    if (!meta.columns[key]) {
      throw new Error(`${where} references unknown column "${key}"`);
    }
  }
}

/**
 * Views have unique ids, and each one names columns, a sort and a display the
 * table view has; the default view is one of them.
 */
export function validateViews(
  controllerName: string,
  meta: TableViewMeta,
  options: DisplayDeclarations & { views?: TableViewViewsOptions },
): void {
  const { views } = options;
  if (!views) return;
  const displays = offeredDisplayIds(options);
  const ids = new Set<string>();
  for (const view of views.items) {
    const where = `TableView view "${view.id}" on ${controllerName}`;
    if (ids.has(view.id)) {
      throw new Error(`${where} is declared twice: view ids are unique`);
    }
    ids.add(view.id);
    assertViewFilters(where, meta, view);
    if (view.display && !displays.has(view.display)) {
      throw new Error(
        `${where} opens display "${view.display}", which the table does not offer`,
      );
    }
  }
  if (views.defaultView && !ids.has(views.defaultView)) {
    throw new Error(
      `TableView on ${controllerName} defaults to view "${views.defaultView}", which is not declared`,
    );
  }
}

/** The kinds addressing one row, whose slug therefore has to carry an `:id`. */
const ROW_SCOPED_FORM_PAGE_KINDS = ["edit", "details"] as const;

/** A declared slug for a row-scoped form page must carry the row's `:id`. */
export function assertRowScopedFormSlugs(
  pages: FormContainerPages | undefined,
): void {
  for (const kind of ROW_SCOPED_FORM_PAGE_KINDS) {
    const declared = pages?.[kind]?.urlSlug;
    if (declared && !declared.includes(":id")) {
      throw new Error(
        `TableView formContainer.pages.${kind}.urlSlug must contain :id placeholder. Got: ${declared}`,
      );
    }
  }
}

/** A tab filters the rows or opens another page, never both. */
export function assertTabTargets(
  controllerName: string,
  tabs: TableViewTab[] | undefined,
): void {
  for (const tab of tabs ?? []) {
    if (tab.filter && tab.to) {
      throw new Error(
        `TableView tab "${tab.id}" on ${controllerName} gives both a filter and a link (to): a tab filters the rows or opens another page, not both`,
      );
    }
  }
}

/**
 * Every declaration check `TableView()` runs before it builds anything: the
 * options naming columns, displays, tabs and sizes name ones the table view
 * can have.
 */
export function validateTableViewOptions<T extends Record<string, unknown>>(
  controllerName: string,
  meta: TableViewMeta,
  options: TableViewOptions<T>,
): void {
  validateKanbanOptions(controllerName, meta, options.kanban);
  assertKnownColumns(
    controllerName,
    meta,
    "card fields",
    options.card?.fields ?? [],
  );
  validateGroupedOptions(controllerName, meta, options.grouped);
  validateDisplayIds(controllerName, options.displays);
  validateDefaultDisplay(controllerName, options);
  validateViews(controllerName, meta, options);
  validateReorder(controllerName, meta, options);
  validateQuickFilters(controllerName, meta, options.quickFilters);
  validatePageSize(controllerName, options.pageSize);
  assertTabTargets(controllerName, options.tabs);
}
