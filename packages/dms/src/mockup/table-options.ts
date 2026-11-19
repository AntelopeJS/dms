import type { BlockOptionSchema } from "@antelopejs/interface-dms/base/block-types";
import { describeOptions } from "@antelopejs/interface-dms/base/block-registry/internal/describe";
import { getDataTypeId } from "@antelopejs/interface-dms/base/data-types";
import {
  type GroupedOptions,
  type TableViewOptions,
  TableViewSchema,
  type TableViewSourceColumn,
  type TableViewSourceOptions,
  type TableViewTab,
  type TableViewViewsOptions,
} from "@antelopejs/interface-dms/base/table-view";
import { serializeTableViewDisplays } from "@antelopejs/interface-dms/base/table-view/internal/factory-helpers";
import {
  offeredDisplayIds,
  validateDefaultDisplay,
} from "@antelopejs/interface-dms/base/table-view/internal/validation";
import { serializeTableViewViews } from "@antelopejs/interface-dms/base/table-view/internal/views";
import { TONES } from "@antelopejs/interface-dms/base/types/tone";
import type { TabsChoice } from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { badgeTabs } from "./display-values";
import type { MockupIssue } from "./model";
import { badgeOf, type SpecColumn } from "./table-columns";

const tabSchema = TableViewSchema.shape.tabs.unwrap().element;

const TAB_KEYS: readonly string[] = Object.keys(tabSchema.shape);

const TAB_COLORS =
  "textColor colours its label and iconColor its icon, each a tone such as success";

/** What a tab key that is not a tab's says instead: the key a writer meant. */
const TAB_KEY_HINTS: ReadonlyMap<string, string> = new Map([
  ["color", TAB_COLORS],
  ["colour", TAB_COLORS],
  ["tone", TAB_COLORS],
]);

/**
 * The tabs, as `TableView` takes them, a key no tab has refused at that key
 * rather than dropped: a `color` names `textColor` and `iconColor`.
 */
export const strictTabsSchema = z.array(
  tabSchema.passthrough().superRefine((tab, context) => {
    for (const key of Object.keys(tab)) {
      if (TAB_KEYS.includes(key)) continue;
      const hint =
        TAB_KEY_HINTS.get(key) ?? `its keys are ${TAB_KEYS.join(", ")}`;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: `a tab has no "${key}": ${hint}`,
      });
    }
  }),
);

/** The kanban board, as `TableView` takes it. */
const kanbanSchema = TableViewSchema.shape.kanban.unwrap().strict();

/** The grouped display, as `TableView` takes it. */
const groupedSchema = z
  .object({
    groupByField: z.string(),
    by: z.enum(["value", "day", "week"]).optional(),
    collapsible: z.boolean().optional(),
    count: z.boolean().optional(),
  })
  .strict() satisfies z.ZodType<GroupedOptions>;

const viewSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    icon: z.string().optional(),
    tone: z.enum(TONES).optional(),
    dot: z.enum(TONES).optional(),
    count: z.boolean().optional(),
    filters: z
      .array(
        z
          .object({
            accessorKey: z.string(),
            value: z.string().optional(),
            mode: z.string(),
          })
          .strict(),
      )
      .optional(),
    search: z.string().optional(),
    sort: z
      .array(
        z.object({ field: z.string(), desc: z.boolean().optional() }).strict(),
      )
      .optional(),
    columns: z
      .object({
        visible: z.array(z.string()).optional(),
        hidden: z.array(z.string()).optional(),
        order: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    display: z.string().optional(),
    density: z.enum(["default", "compact"]).optional(),
  })
  .strict();

/** The saved views, as `TableView` takes them; a view's permission is code, so a mockup holds none. */
const viewsSchema = z
  .object({
    items: z.array(viewSchema),
    layout: z.enum(["tabs", "strip", "menu"]).optional(),
    defaultView: z.string().optional(),
    userViews: z.boolean().optional(),
  })
  .strict() satisfies z.ZodType<TableViewViewsOptions>;

/** Tabs read from a badge column, as the builder writes them for a mapped relation. */
const tabsFromSchema = z
  .object({ column: z.string() })
  .strict() satisfies z.ZodType<TabsChoice>;

/** What a mockup table takes beyond `TableView.fromSource`, which the real `TableView` has. */
export const tableOptionsSchema = z.object({
  kanban: kanbanSchema
    .optional()
    .describe(
      "The kanban board: a column of cards per value of groupByField, a select (a badge), boolean or status column. A card never moves in a mockup.",
    ),
  grouped: groupedSchema
    .optional()
    .describe(
      "The grid with a header row per group of groupByField, a sortable column; by day or week needs a date column.",
    ),
  views: viewsSchema
    .optional()
    .describe(
      "The saved views: filters on filterable columns, sorts on sortable ones, a display the table offers.",
    ),
  tabsFrom: tabsFromSchema
    .optional()
    .describe(
      'Tabs read from a filterable badge column, as the builder writes them: "All", then one per badge item in its tone. Leave tabs out.',
    ),
});

/** {@link tableOptionsSchema}, described for the JSON Schema. */
export function describeTableOptions(): Record<string, BlockOptionSchema> {
  return describeOptions(tableOptionsSchema);
}

/** A mockup table's options that reach beyond its columns. */
export type TableOptions = z.infer<typeof tableOptionsSchema> &
  Pick<
    TableViewSourceOptions,
    "displays" | "card" | "tabs" | "defaultDisplay" | "mobileDisplay"
  >;

/** What a mockup table adds to the options `TableView.fromSource` serialized. */
type SerializedOptions = Pick<
  TableViewOptions,
  "defaultDisplay" | "mobileDisplay"
> & {
  displays: ReturnType<typeof serializeTableViewDisplays>;
  views?: ReturnType<typeof serializeTableViewViews>;
};

/** A table's columns, as written and as built. */
export interface TableColumns {
  written: Record<string, SpecColumn>;
  built: Record<string, TableViewSourceColumn>;
}

const KANBAN_TYPES: ReadonlySet<string> = new Set([
  "select",
  "boolean",
  "status",
]);

/** Collects what a table's options get wrong about its columns. */
class ColumnCheck {
  readonly issues: MockupIssue[] = [];

  constructor(
    private readonly columns: TableColumns,
    private readonly pointer: string,
  ) {}

  refuse(at: string, message: string): void {
    this.issues.push({ path: `${this.pointer}${at}`, message });
  }

  /** The column `name` as written; an unknown one is refused, naming the columns. */
  column(at: string, name: string): SpecColumn | undefined {
    const { written } = this.columns;
    if (Object.hasOwn(written, name)) return written[name];
    this.refuse(
      at,
      `the table has no column "${name}"; its columns are ${Object.keys(written).join(", ")}`,
    );
    return undefined;
  }

  typeOf(name: string): string | undefined {
    const { built } = this.columns;
    return Object.hasOwn(built, name)
      ? getDataTypeId(built[name].type)
      : undefined;
  }

  kanban(groupByField: string): void {
    if (!this.column("/kanban/groupByField", groupByField)) return;
    const type = this.typeOf(groupByField);
    if (type === undefined || !KANBAN_TYPES.has(type)) {
      this.refuse(
        "/kanban/groupByField",
        `a kanban groups its cards on a select, a boolean or a status column, and "${groupByField}" is ${type ?? "unknown"}: give it a badge display`,
      );
    }
  }

  grouped({ groupByField, by }: GroupedOptions): void {
    const column = this.column("/grouped/groupByField", groupByField);
    if (!column) return;
    if (!column.sortable) {
      this.refuse(
        "/grouped/groupByField",
        `"${groupByField}" must be sortable: the grouped display lists the rows sorted on it`,
      );
    }
    const type = this.typeOf(groupByField);
    if (by && by !== "value" && type !== "date") {
      this.refuse(
        "/grouped/by",
        `grouping by ${by} needs a date column, and "${groupByField}" is ${type ?? "unknown"}`,
      );
    }
  }

  views(views: z.infer<typeof viewsSchema>, offered: Set<string>): void {
    const ids = new Set<string>();
    views.items.forEach((view, index) => {
      const at = `/views/items/${index}`;
      if (ids.has(view.id)) {
        this.refuse(`${at}/id`, `the view id "${view.id}" is taken`);
      }
      ids.add(view.id);
      (view.filters ?? []).forEach(({ accessorKey }, filter) => {
        const where = `${at}/filters/${filter}/accessorKey`;
        const column = this.column(where, accessorKey);
        if (column && !column.filterable) {
          this.refuse(where, `"${accessorKey}" is not filterable`);
        }
      });
      (view.sort ?? []).forEach(({ field }, sort) => {
        const where = `${at}/sort/${sort}/field`;
        const column = this.column(where, field);
        if (column && !column.sortable) {
          this.refuse(where, `"${field}" is not sortable`);
        }
      });
      for (const [key, names] of Object.entries(view.columns ?? {})) {
        for (const name of names ?? [])
          this.column(`${at}/columns/${key}`, name);
      }
      if (view.display && !offered.has(view.display)) {
        this.refuse(
          `${at}/display`,
          `the table does not offer the ${view.display} display; it offers ${[...offered].join(", ")}`,
        );
      }
    });
    if (views.defaultView !== undefined && !ids.has(views.defaultView)) {
      this.refuse(
        "/views/defaultView",
        `defaultView "${views.defaultView}" is not one of the views`,
      );
    }
  }

  /** "All", then a tab per value of the badge column, as the builder writes them. */
  tabsFrom({ column: name }: TabsChoice): TableViewTab[] {
    const column = this.column("/tabsFrom/column", name);
    if (!column) return [];
    const badge = badgeOf(column);
    if (!column.filterable || !badge) {
      this.refuse(
        "/tabsFrom/column",
        `tabs by "${name}" need a column the table filters, with a badge display`,
      );
      return [];
    }
    return badgeTabs(name, badge);
  }
}

/** What a mockup table's options get wrong about its columns, and the tabs they draw. */
export interface CheckedTableOptions {
  issues: MockupIssue[];
  tabs: TableViewTab[] | undefined;
}

/** Checks the options a mockup table adds against its columns; `tabsFrom` writes the tabs. */
export function checkTableOptions(
  options: TableOptions,
  columns: TableColumns,
  pointer: string,
): CheckedTableOptions {
  const check = new ColumnCheck(columns, pointer);
  const { kanban, grouped, views, tabsFrom } = options;
  if (tabsFrom && options.tabs) {
    check.refuse("/tabsFrom", "tabsFrom writes the tabs: leave tabs out");
  }
  if (kanban) check.kanban(kanban.groupByField);
  if (grouped) check.grouped(grouped);
  if (views) check.views(views, offeredDisplayIds(options));
  const tabs = tabsFrom ? check.tabsFrom(tabsFrom) : options.tabs;
  return { issues: check.issues, tabs };
}

/**
 * The options a mockup table adds, serialized as `TableView` does: the kanban
 * board and the grouped display as entries of `displays`, and the views. A
 * card never moves on the board, since the fixture rows are read-only.
 * @throws When the default display, or the one on phones, is not offered.
 */
export function serializeTableOptions(
  options: TableOptions,
  where: string,
): SerializedOptions {
  const { kanban, defaultDisplay, mobileDisplay, views } = options;
  const declared = {
    ...options,
    kanban: kanban && { ...kanban, draggable: false },
  };
  validateDefaultDisplay(where, declared);
  return {
    displays: serializeTableViewDisplays(declared),
    defaultDisplay,
    mobileDisplay,
    views: serializeTableViewViews(views),
  };
}
