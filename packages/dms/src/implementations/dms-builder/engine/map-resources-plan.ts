import type {
  ColumnDescription,
  RelationDescription,
} from "@antelopejs/interface-database-catalog";
import type {
  ColumnDisplay,
  DataTypeValue,
  FieldSpec,
  LeftOutColumn,
  MapResourcesInput,
  MappedField,
  MappedResource,
  OpWarning,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";
import { columnLabel } from "./column-label";
import { nativeKind } from "./native-kind";
import { pascalCase } from "./emit";
import type { ResourceNames } from "./resource-emit";
import { RESERVED_FIELD_NAMES } from "./reserved-names";
import { MixedTypeDeclarations } from "./mixed-types";
import {
  type TabConfig,
  displayRefusal,
  fieldDataType,
  suits,
} from "./column-display";
import type { DisplayDefaults } from "./display-defaults";
import { refuse } from "./mapping-refusal";
import type { PlannedPage } from "./planned-page";
import { singular, words } from "./name-words";

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const ID_COLUMN = "_id";

/** The DataType a TableView column shows for each declaration; others stay off the TableView. */
const DATA_TYPES = new Map([
  ["string", "string"],
  ["number", "number"],
  ["boolean", "boolean"],
  ["date", "date"],
]);

const TS_TYPES = new Map([
  ["string", "string"],
  ["number", "number"],
  ["boolean", "boolean"],
  ["date", "Date"],
  ["object", "Record<string, unknown>"],
  ["any", "unknown"],
]);

/** One relation, planned: names, the table's fields, and the controller's when it has a TableView. */
export interface PlannedResource {
  relation: string;
  description: RelationDescription;
  names: ResourceNames;
  ref: string;
  folder: string;
  tableFields: FieldSpec[];
  apiFields: FieldSpec[];
  hasKey: boolean;
  tableView: boolean;
  routes?: ResourceRoute[];
  label?: string;
  displayName: string;
  /** The page's own options and the table options the mapping sets. */
  page: PlannedPage;
  tabs?: TabConfig[];
  /** The page's tabs are the ones a mapping wrote, and the call turns tabs off. */
  clearTabs: boolean;
}

export interface MappingPlan {
  resources: PlannedResource[];
  leftOut: LeftOutColumn[];
  warnings: OpWarning[];
  /** Why each relation left out of the batch was refused. */
  refused: string[];
}

function tsType(declared: string): string {
  if (declared.endsWith("[]")) {
    return `${tsType(declared.slice(0, -2))}[]`;
  }
  return TS_TYPES.get(declared) ?? "unknown";
}

export function namesFor(
  input: MapResourcesInput,
  resource: MappedResource,
  description: RelationDescription,
): ResourceNames {
  const className =
    resource.className ?? pascalCase(singular(description.name));
  if (!IDENTIFIER.test(className)) {
    refuse(
      `relation ${resource.relation} needs a className: "${className}" is not one`,
    );
  }
  const apiName = `${className.charAt(0).toLowerCase()}${className.slice(1)}DataAPI`;
  const route = `/api/${[input.connection, description.schema, description.name]
    .map((part) => words(part).join("-"))
    .join("/")}`;
  return {
    className,
    modelName: `${className}Model`,
    apiName,
    tableName: description.name,
    route,
  };
}

function columnOf(
  description: RelationDescription,
  name: string,
): ColumnDescription {
  return (
    description.columns.find((column) => column.name === name) ??
    refuse(
      `relation ${description.schema}.${description.name} has no column "${name}"`,
    )
  );
}

/** The declaration chosen for a column, which must be one the catalog says registration accepts. */
function declaredFor(
  description: RelationDescription,
  column: ColumnDescription,
  wanted: string | undefined,
): string {
  const accepted = column.accepts.length
    ? column.accepts.map((entry) => entry.declared)
    : MixedTypeDeclarations(column);
  if (accepted.length === 0) {
    refuse(
      `column ${description.schema}.${description.name}.${column.name} is ${column.native}, which no field type reads`,
    );
  }
  const declared = wanted ?? accepted[0];
  if (!accepted.includes(declared)) {
    refuse(
      `column ${description.schema}.${description.name}.${column.name} is ${column.native}: declare it as ${accepted.join(" or ")}, not ${declared}`,
    );
  }
  return declared;
}

/**
 * What the plan knows about a relation a column may refer to: one of the batch, or one the module
 * has mapped already.
 */
export interface BatchTarget {
  resource: MappedResource;
  description: RelationDescription;
  names: ResourceNames;
  ref: string;
}

export function relationName(description: RelationDescription): string {
  return `${description.schema}.${description.name}`;
}

export function describedAs(
  descriptions: RelationDescription[],
  relation: string,
): RelationDescription {
  return (
    descriptions.find(
      (description) => relationName(description) === relation,
    ) ?? refuse(`no description of ${relation} was given`)
  );
}

interface ChosenField {
  field: MappedField;
  onController: boolean;
}

/**
 * The fields to declare: the ones chosen, then each key column left out. Such a key is on the
 * controller only when a writable TableView has to set it. A column named `_id`, the key of a
 * document source, is the alias every keyed table declares already, so it is never declared again;
 * nor is a key column no field type reads, such as a RethinkDB compound key, which `_id` serves.
 */
function chosenFields(
  resource: MappedResource,
  description: RelationDescription,
): ChosenField[] {
  const chosen = resource.fields
    .filter((field) => field.column !== ID_COLUMN)
    .map((field) => ({ field, onController: true }));
  const keyColumns = (description.key?.columns ?? []).filter(
    (name) =>
      name !== ID_COLUMN && columnOf(description, name).accepts.length > 0,
  );
  for (const column of keyColumns) {
    if (!resource.fields.some((field) => field.column === column)) {
      const settable =
        resource.writable &&
        isNaturalKey(description, columnOf(description, column));
      chosen.push({ field: { column }, onController: settable });
    }
  }
  return chosen;
}

function tableField(field: MappedField, declared: string): FieldSpec {
  return {
    name: field.column,
    dataType: { $dataType: DATA_TYPES.get(declared) ?? "string" },
    dbField: { field: JSON.stringify(declared), ts: tsType(declared) },
  };
}

function relationDataType(
  target: BatchTarget,
  column: string,
  warnings: OpWarning[],
): DataTypeValue {
  if (!target.resource.label) {
    warnings.push({
      code: "label_changed",
      message: `${column} refers to ${relationName(target.description)}, which has no label: the column shows its key`,
    });
  }
  return {
    $dataType: "relation",
    config: {
      dataApiController: { $ref: { resource: target.ref } },
      keyMapping: {
        label: target.resource.label ?? ID_COLUMN,
        value: ID_COLUMN,
      },
    },
  };
}

/** A relation column's target: a mapped relation with a TableView and a single-column key. */
function referenceTarget(
  targets: Map<string, BatchTarget>,
  description: RelationDescription,
  field: MappedField,
): BatchTarget | undefined {
  if (!field.relation) {
    return undefined;
  }
  const target =
    targets.get(field.relation) ??
    refuse(
      `${relationName(description)}.${field.column} refers to ${field.relation}, which is neither in this batch nor mapped in the module`,
    );
  if (
    target.description.key?.columns.length !== 1 ||
    !target.resource.tableView
  ) {
    refuse(
      `${field.relation} has no single-column key and TableView, so ${field.column} cannot be a relation column onto it`,
    );
  }
  const key = columnOf(target.description, target.description.key.columns[0]);
  const native = columnOf(description, field.column).native;
  const declared = description.references.some(
    (reference) =>
      reference.from.columns.length === 1 &&
      reference.from.columns[0] === field.column &&
      reference.to.relation === field.relation &&
      reference.to.columns.length === 1 &&
      reference.to.columns[0] === key.name,
  );
  if (!declared && nativeKind(key.native) !== nativeKind(native)) {
    refuse(
      `${relationName(description)}.${field.column} holds ${native} and the key of ${field.relation} holds ${key.native}, so no value of one can find a row of the other`,
    );
  }
  return target;
}

interface ControllerChoice {
  spec?: FieldSpec;
  display?: ColumnDisplay;
  reason?: string;
}

/**
 * The display of a column: the one sent, none for null, and for a field that left it out the one
 * its relation held before or the rules propose, when it suits the declaration.
 */
function displayOf(
  defaults: DisplayDefaults | undefined,
  field: MappedField,
  declared: string,
): ColumnDisplay | undefined {
  if (field.display !== undefined) {
    return field.display ?? undefined;
  }
  const fallback =
    defaults?.kind === "mapped"
      ? defaults.displays.get(field.column)
      : defaults?.propose(field.column, declared);
  return fallback && suits(fallback, declared) ? fallback : undefined;
}

/**
 * A key column the database does not fill in: a new row can only be created with it, so a
 * writable TableView lets it be set. On edit it stays an assertion, never an assignment.
 */
function isNaturalKey(
  description: RelationDescription,
  column: ColumnDescription,
): boolean {
  return (
    (description.key?.columns ?? []).includes(column.name) &&
    !column.hasDefault &&
    column.readOnly === undefined
  );
}

function isReadOnly(
  resource: MappedResource,
  description: RelationDescription,
  column: ColumnDescription,
): boolean {
  const isKey = (description.key?.columns ?? []).includes(column.name);
  return (
    !resource.writable ||
    column.readOnly !== undefined ||
    (isKey && !isNaturalKey(description, column))
  );
}

/**
 * The display a column is written with. One that does not suit the column, or that sits on the
 * key, is dropped: the column is written plain and, when the display was sent, a warning says so.
 */
function usableDisplay(
  plan: FieldPlan,
  field: MappedField,
  declared: string,
  display: ColumnDisplay | undefined,
): ColumnDisplay | undefined {
  if (!display) {
    return undefined;
  }
  const isKey = (plan.description.key?.columns ?? []).includes(field.column);
  const reason = isKey
    ? "it is the primary key, which names a row and is not drawn as a badge or a price"
    : displayRefusal(display, declared);
  if (reason === undefined) {
    return display;
  }
  if (field.display) {
    plan.warnings.push({
      code: "display_dropped",
      message: `${relationName(plan.description)}.${field.column}: written plain, ${reason}`,
    });
  }
  return undefined;
}

/** The controller's field for a column, or why the TableView leaves it out. */
function controllerField(
  plan: FieldPlan,
  field: MappedField,
  declared: string,
): ControllerChoice {
  const { resource, description, targets } = plan;
  if (!IDENTIFIER.test(field.column)) {
    return {
      reason:
        "its name is not a TypeScript identifier, so a controller cannot declare it",
    };
  }
  if (RESERVED_FIELD_NAMES.has(field.column)) {
    return {
      reason: `"${field.column}" is a DataController member, so a controller cannot declare it`,
    };
  }
  const target = referenceTarget(targets, description, field);
  if (target && field.display) {
    plan.warnings.push({
      code: "display_dropped",
      message: `${relationName(description)}.${field.column} is a relation column, which takes no display: written without one`,
    });
  }
  const scalar = DATA_TYPES.get(declared);
  const source =
    target ?? (scalar === undefined ? undefined : { $dataType: scalar });
  if (!source) {
    return {
      reason: `a ${declared} field is not shown in a TableView in this version`,
    };
  }
  const column = columnOf(description, field.column);
  const readOnly = isReadOnly(resource, description, column);
  const display = target
    ? undefined
    : usableDisplay(
        plan,
        field,
        declared,
        displayOf(plan.defaults, field, declared),
      );
  return {
    display,
    spec: {
      name: field.column,
      label: columnLabel(plan.defaults, field, column, target),
      dataType:
        "$dataType" in source
          ? fieldDataType(
              display,
              declared,
              source,
              `${relationName(description)}.${field.column}`,
            )
          : relationDataType(source, field.column, plan.warnings),
      listable: field.listable ?? true,
      filterable: field.filterable ?? false,
      sortable: field.sortable ?? false,
      searchable: field.searchable ?? false,
      selectable: resource.label === field.column,
      access: readOnly ? "read" : "readwrite",
      required: !readOnly && !column.nullable && !column.hasDefault,
    },
  };
}

interface FieldPlan {
  resource: MappedResource;
  description: RelationDescription;
  targets: Map<string, BatchTarget>;
  leftOut: LeftOutColumn[];
  warnings: OpWarning[];
  defaults?: DisplayDefaults;
}

interface PlannedFields {
  tableFields: FieldSpec[];
  apiFields: FieldSpec[];
  /** The display each controller field is drawn with, for the ones with one. */
  displays: Map<string, ColumnDisplay>;
  /** A text column left its display out and nothing could tell whether it is a badge. */
  unproposed: boolean;
}

/** Whether the rules had no profile to read a text column left without a display by. */
function isUnproposed(
  plan: FieldPlan,
  field: MappedField,
  declared: string,
): boolean {
  return (
    field.display === undefined &&
    field.relation === undefined &&
    declared === "string" &&
    plan.defaults?.kind === "new" &&
    plan.defaults.source === "name"
  );
}

export function plannedFields(plan: FieldPlan): PlannedFields {
  const tableFields: FieldSpec[] = [];
  const apiFields: FieldSpec[] = [];
  const displays = new Map<string, ColumnDisplay>();
  let unproposed = false;
  for (const { field, onController } of chosenFields(
    plan.resource,
    plan.description,
  )) {
    const column = columnOf(plan.description, field.column);
    const declared = field.relation
      ? "string"
      : declaredFor(plan.description, column, field.declared);
    if (field.relation) {
      declaredFor(plan.description, column, "string");
    }
    tableFields.push(tableField(field, declared));
    if (!onController) {
      continue;
    }
    const choice = controllerField(plan, field, declared);
    unproposed ||=
      choice.spec !== undefined && isUnproposed(plan, field, declared);
    if (choice.spec) {
      apiFields.push(choice.spec);
      if (choice.display) {
        displays.set(choice.spec.name, choice.display);
      }
    } else {
      plan.leftOut.push({
        relation: relationName(plan.description),
        column: field.column,
        reason: choice.reason ?? "",
      });
    }
  }
  return { tableFields, apiFields, displays, unproposed };
}
