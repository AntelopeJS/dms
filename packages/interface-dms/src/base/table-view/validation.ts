// The declaration checks the TableView factory runs before building anything:
// every option naming a column, a display or a form slug must name one the
// table view actually has.
//
// Split out of factory-helpers.ts.

import { getDataTypeId } from "../data-types";
import { TableViewMeta } from "./meta";
import {
  type FormContainerPages,
  CARDS_DISPLAY_ID,
  GROUPED_DISPLAY_ID,
  KANBAN_DISPLAY_ID,
  type KanbanOptions,
  MAX_TABLE_PAGE_SIZE,
  TABLE_DISPLAY_ID,
  type TableViewDisplayOption,
  type TableViewQuickFilter,
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

/** The default display must be the table, the kanban or a declared display. */
export function validateDefaultDisplay(
  controllerName: string,
  options: {
    defaultDisplay?: string;
    kanban?: KanbanOptions;
    displays?: TableViewDisplayOption[];
  },
): void {
  const { defaultDisplay, kanban, displays } = options;
  if (!defaultDisplay) return;
  const knownDisplayIds = new Set<string>([
    TABLE_DISPLAY_ID,
    ...(kanban ? [KANBAN_DISPLAY_ID] : []),
    ...(displays?.map((display) => display.id) ?? []),
  ]);
  if (!knownDisplayIds.has(defaultDisplay)) {
    throw new Error(
      `TableView on ${controllerName} defaults to display "${defaultDisplay}" which is not declared in displays`,
    );
  }
}

/** The kinds addressing one row, whose slug therefore has to carry an `:id`. */
const ROW_SCOPED_FORM_PAGE_KINDS = ["edit", "view"] as const;

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
