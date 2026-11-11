import type {
  ColumnDisplay,
  FieldSpec,
  MappedResource,
  MapResourcesInput,
  OpWarning,
  TableViewSettings,
} from "@antelopejs/interface-dms-builder";
import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import { type TabConfig, plannedTabs } from "./column-display";
import { MappingRefusal } from "./mapping-refusal";

const ID_COLUMN = "_id";

function relationName(description: RelationDescription): string {
  return `${description.schema}.${description.name}`;
}

/**
 * The label a relation's columns are shown by, as the generated code can read it: a single-column
 * key is the controller's `_id`, a column the mapping does not list is dropped.
 */
export function readableLabel(
  resource: MappedResource,
  description: RelationDescription,
  warnings: OpWarning[],
): string | undefined {
  const { label } = resource;
  if (label === undefined || label === ID_COLUMN) {
    return label;
  }
  const key = description.key?.columns ?? [];
  if (key.length === 1 && key[0] === label) {
    warnings.push({
      code: "label_changed",
      message: `${relationName(description)}: the label ${label} is the primary key, which the controller names ${ID_COLUMN}: label set to ${ID_COLUMN}`,
    });
    return ID_COLUMN;
  }
  if (!resource.fields.some((field) => field.column === label)) {
    warnings.push({
      code: "label_changed",
      message: `${relationName(description)}: the label ${label} is not one of the fields mapped, so the relation has no label`,
    });
    return undefined;
  }
  return label;
}

/** The columns the table options filter on and sort by, which the controller must let the TableView do. */
/** The columns that must be filterable and the ones that must be sortable. */
interface NeededFlags {
  filterable: Set<string>;
  sortable: Set<string>;
}

function neededFlags(
  options: TableViewSettings | undefined,
  tabsColumn: string | undefined,
): NeededFlags {
  const filterable = new Set<string>();
  const sortable = new Set<string>();
  if (tabsColumn) {
    filterable.add(tabsColumn);
  }
  for (const view of options?.views?.items ?? []) {
    view.filters?.forEach((filter) => filterable.add(filter.column));
    view.sort?.forEach((sort) => sortable.add(sort.column));
  }
  for (const entry of options?.footer?.summary ?? []) {
    if (entry.where) {
      filterable.add(entry.where.column);
    }
  }
  if (options?.grouped) {
    sortable.add(options.grouped.groupBy);
    if (options.grouped.count) {
      filterable.add(options.grouped.groupBy);
    }
  }
  return { filterable, sortable };
}

/**
 * Marks filterable or sortable the shown columns the page's tabs, views, footer figures and
 * grouping need: the builder writes the controller, so it gives the page what it asks of it.
 */
export function raiseFlags(
  where: string,
  apiFields: FieldSpec[],
  options: TableViewSettings | undefined,
  tabsColumn: string | undefined,
  warnings: OpWarning[],
): void {
  const needed = neededFlags(options, tabsColumn);
  for (const spec of apiFields) {
    for (const flag of ["filterable", "sortable"] as const) {
      if (needed[flag].has(spec.name) && spec[flag] !== true) {
        spec[flag] = true;
        warnings.push({
          code: "field_flag_set",
          message: `${where}.${spec.name} was marked ${flag}: the table options use it`,
        });
      }
    }
  }
}

/** Tabs the table cannot show are left out with a warning, the page is written without them. */
/** The tabs of a table, and whether they were left out. */
interface SafeTabs {
  tabs?: TabConfig[];
  dropped: boolean;
}

export function safeTabs(
  choice: {
    resource: MappedResource;
    where: string;
    apiFields: FieldSpec[];
    displays: ReadonlyMap<string, ColumnDisplay>;
    proposed: boolean;
  },
  warnings: OpWarning[],
): SafeTabs {
  try {
    return {
      tabs: plannedTabs(
        choice.resource,
        choice.where,
        choice.apiFields,
        choice.displays,
        choice.proposed,
      ),
      dropped: false,
    };
  } catch (error) {
    if (!(error instanceof MappingRefusal)) {
      throw error;
    }
    warnings.push({
      code: "display_dropped",
      message: `${error.message}: written without tabs`,
    });
    return { dropped: true };
  }
}

/** The relations whose columns point at a relation already refused, which would point at nothing. */
export function dependents(
  input: MapResourcesInput,
  refused: Map<string, string>,
): void {
  let grew = true;
  while (grew) {
    grew = false;
    for (const resource of input.resources) {
      const gone = resource.fields.find(
        (field) =>
          field.relation != null &&
          refused.has(field.relation) &&
          !refused.has(resource.relation),
      );
      if (gone) {
        refused.set(
          resource.relation,
          `${gone.column} refers to ${gone.relation}, which was not written`,
        );
        grew = true;
      }
    }
  }
}
