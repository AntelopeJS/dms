import type {
  FooterSummarySetting,
  OpWarning,
  ResourceFieldStructure,
  ValidationIssue,
  ViewSetting,
} from "@antelopejs/interface-dms-builder";

const KANBAN_TYPES = new Set(["select", "boolean", "status"]);
const ADDITIVE_TYPES = new Set(["number", "price"]);
const VIEW_ID = /^[a-z0-9][a-z0-9-]*$/;
const VALUELESS_MODES = new Set(["is_empty", "is_not_empty"]);
const LIST_OPERATORS = new Set(["in", "notIn"]);

/** What the settings check about one column of the table the page reads. */
export interface Column {
  name: string;
  /** The DataType id; absent for a column the builder cannot read (a relation, a hand-written one). */
  type?: string;
  multiple: boolean;
  filterable?: boolean;
  sortable?: boolean;
  listable?: boolean;
}

export function columnOf(field: ResourceFieldStructure): Column {
  const config = field.dataType?.config;
  return {
    name: field.name,
    type: field.dataType?.$dataType,
    multiple: config?.multiple === true,
    filterable: field.opaque ? undefined : (field.filterable ?? false),
    sortable: field.opaque ? undefined : (field.sortable ?? false),
    listable: field.opaque ? undefined : (field.listable ?? true),
  };
}

/** Collects what the settings get wrong against the table's columns, and what they leave behind. */
export class Check {
  readonly issues: ValidationIssue[] = [];
  readonly warnings: OpWarning[] = [];
  /** The columns the settings need filterable or sortable, which the builder marks as such. */
  readonly flags = {
    filterable: new Set<string>(),
    sortable: new Set<string>(),
  };

  constructor(private readonly columns: ReadonlyMap<string, Column>) {}

  refuse(pointer: string, message: string): void {
    this.issues.push({ pointer, message });
  }

  /** Asks for a column to be made filterable or sortable when it is not. */
  private need(
    column: Column | undefined,
    flag: "filterable" | "sortable",
  ): void {
    if (
      column &&
      column[flag] === false &&
      !this.flags[flag].has(column.name)
    ) {
      this.flags[flag].add(column.name);
      this.warnings.push({
        code: "field_flag_set",
        message: `"${column.name}" was marked ${flag}: the settings use it`,
      });
    }
  }

  /** The column when the table has it; an unknown one is a refusal naming the columns. */
  column(pointer: string, name: string): Column | undefined {
    const found = this.columns.get(name);
    if (!found) {
      this.refuse(
        pointer,
        `the table has no column "${name}"; its columns are ${[...this.columns.keys()].join(", ")}`,
      );
    }
    return found;
  }

  kanban(groupBy: string): void {
    const column = this.column("/kanban/groupBy", groupBy);
    if (!column) {
      return;
    }
    const eligible =
      column.type !== undefined &&
      KANBAN_TYPES.has(column.type) &&
      !column.multiple;
    if (!eligible) {
      this.refuse(
        "/kanban/groupBy",
        `a kanban groups on a single-choice column (a select that is not multiple, a boolean or a status), and "${groupBy}" is ${column.type ?? "not readable by the builder"}`,
      );
    }
  }

  grouped(groupBy: string, by: string | undefined, count: boolean): void {
    const column = this.column("/grouped/groupBy", groupBy);
    if (!column) {
      return;
    }
    this.need(column, "sortable");
    if (by && by !== "value" && column.type !== "date") {
      this.refuse(
        "/grouped/by",
        `grouping by ${by} needs a date column, and "${groupBy}" is ${column.type ?? "not readable by the builder"}`,
      );
    }
    if (count) {
      this.need(column, "filterable");
    }
  }

  cardFields(fields: string[]): void {
    for (const name of fields) {
      const column = this.column("/cards/fields", name);
      if (column?.listable === false) {
        this.refuse("/cards/fields", `"${name}" is not listable`);
      }
    }
  }

  summary(entry: FooterSummarySetting, pointer: string): void {
    if (!entry.label.trim()) {
      this.refuse(`${pointer}/label`, "a footer figure needs a label");
    }
    if (entry.op === "sum") {
      this.sum(entry, pointer);
    }
    if (entry.where) {
      this.need(
        this.column(`${pointer}/where/column`, entry.where.column),
        "filterable",
      );
      const isList = Array.isArray(entry.where.value);
      if (LIST_OPERATORS.has(entry.where.op) !== isList) {
        this.refuse(
          `${pointer}/where/value`,
          `${entry.where.op} takes ${LIST_OPERATORS.has(entry.where.op) ? "a list" : "a single value"}`,
        );
      }
    }
  }

  private sum(entry: FooterSummarySetting, pointer: string): void {
    if (!entry.field) {
      this.refuse(`${pointer}/field`, "a sum needs the column it adds up");
      return;
    }
    const column = this.column(`${pointer}/field`, entry.field);
    if (column && !(column.type && ADDITIVE_TYPES.has(column.type))) {
      this.refuse(
        `${pointer}/field`,
        `a sum adds up a number or price column, and "${entry.field}" is ${column.type ?? "not readable by the builder"}`,
      );
    }
  }

  view(view: ViewSetting, index: number, offered: ReadonlySet<string>): void {
    const pointer = `/views/items/${index}`;
    if (!VIEW_ID.test(view.id)) {
      this.refuse(
        `${pointer}/id`,
        `"${view.id}" is not a view id: use lower-case words joined by dashes`,
      );
    }
    if (!view.label.trim()) {
      this.refuse(`${pointer}/label`, "a view needs a label");
    }
    this.viewFilters(view, pointer);
    (view.sort ?? []).forEach((sort, at) => {
      const column = this.column(`${pointer}/sort/${at}/column`, sort.column);
      this.need(column, "sortable");
    });
    for (const [key, names] of Object.entries(view.columns ?? {})) {
      for (const name of names ?? []) {
        this.column(`${pointer}/columns/${key}`, name);
      }
    }
    if (view.display && !offered.has(view.display)) {
      this.refuse(
        `${pointer}/display`,
        `the table does not offer the ${view.display} display; it offers ${[...offered].join(", ")}`,
      );
    }
  }

  private viewFilters(view: ViewSetting, pointer: string): void {
    (view.filters ?? []).forEach((filter, at) => {
      const where = `${pointer}/filters/${at}`;
      const column = this.column(`${where}/column`, filter.column);
      this.need(column, "filterable");
      const valueless = VALUELESS_MODES.has(filter.mode ?? "is");
      if (!valueless && (filter.value === undefined || filter.value === "")) {
        this.refuse(
          `${where}/value`,
          `a ${filter.mode ?? "is"} filter needs a value`,
        );
      }
    });
  }
}
