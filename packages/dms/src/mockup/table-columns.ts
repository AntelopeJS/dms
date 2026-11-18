import type { BlockOptionSchema } from "@antelopejs/interface-dms/base/block-types";
import { describeSchema } from "@antelopejs/interface-dms/base/block-registry/internal/describe";
import {
  CreateDataType,
  type DataType,
} from "@antelopejs/interface-dms/base/data-types";
import {
  ColumnDisplay,
  DefaultDisplays,
  type TableViewSourceColumn,
} from "@antelopejs/interface-dms/base/table-view";
import { displayIds } from "@antelopejs/interface-dms/base/table-view/internal/column-display";
import { TONES } from "@antelopejs/interface-dms/base/types/tone";
import type { ColumnDisplay as MappedDisplay } from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { cellDisplayIssues } from "../implementations/dms-builder/engine/cell-displays";
import { displayRefusal } from "../implementations/dms-builder/engine/column-display";
import { displayValuesDataType } from "./display-values";
import type { MockupIssue } from "./model";
import { zodIssues } from "./model";

const badgeItemSchema = z
  .object({ value: z.string(), label: z.string(), tone: z.enum(TONES) })
  .strict();

/** How the builder draws a mapped column, as it proposes and writes it: a badge or a price. */
const mappedDisplaySchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("badge"), items: z.array(badgeItemSchema) })
    .strict(),
  z
    .object({ kind: z.literal("price"), currency: z.string().optional() })
    .strict(),
]) satisfies z.ZodType<MappedDisplay>;

/** A cell display of the TableView, as `{ type, options }` serializes one. */
const cellDisplaySchema = z
  .object({
    type: z.string(),
    options: z.record(z.unknown()).optional(),
  })
  .strict();

/** A column's `display`, described for the JSON Schema: the builder's, or a cell display. */
export const COLUMN_DISPLAY_OPTION: BlockOptionSchema = {
  ...describeSchema(z.union([mappedDisplaySchema, cellDisplaySchema])),
  optional: true,
  description:
    'How the cells draw the column: the builder\'s display of a mapped column, { kind: "badge", items: [{ value, label, tone }] } on a string or select column or { kind: "price", currency? } on a number or price column, else a cell display of the TableView, { type: "identity", options }, its options the ones its DefaultDisplays class takes, as builder_configure_field checks them.',
};

/** A column as a spec writes it: a `@Column`'s options and its display. */
export const columnSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    type: z.string(),
    order: z.number().optional(),
    isVisible: z.boolean().optional(),
    filterable: z.boolean().optional(),
    cellWrap: z.boolean().optional(),
    size: z.number().optional(),
    sortable: z.boolean().optional(),
    display: z.record(z.unknown()).optional(),
    group: z.string().optional(),
  })
  .strict();

export type SpecColumn = z.infer<typeof columnSchema>;

type BadgeDisplay = Extract<MappedDisplay, { kind: "badge" }>;

/** The badge a column is drawn with, when its display is one. */
export function badgeOf(column: SpecColumn): BadgeDisplay | undefined {
  const parsed = mappedDisplaySchema.safeParse(column.display);
  return parsed.success && parsed.data.kind === "badge"
    ? parsed.data
    : undefined;
}

/** The builder's declaration a column of each data type stands for, where the two differ. */
const DECLARATION_OF_TYPE = new Map([
  ["select", "string"],
  ["price", "number"],
]);

type CellDisplay = z.infer<typeof cellDisplaySchema>;

type CellDisplayOptions = NonNullable<CellDisplay["options"]>;

type CellDisplayClass = new (
  options?: CellDisplayOptions,
) => ColumnDisplay<CellDisplayOptions>;

/** A display drawn as the cell display `id`, holding the options a spec writes for it. */
function specDisplayClass(id: string): CellDisplayClass {
  class SpecCellDisplay extends ColumnDisplay<CellDisplayOptions> {}
  displayIds.set(SpecCellDisplay, id);
  return SpecCellDisplay;
}

/** The cell displays the DMS draws itself, by id. */
const CELL_DISPLAYS: ReadonlyMap<string, CellDisplayClass> = new Map(
  Object.values(DefaultDisplays).flatMap(
    (Display): [string, CellDisplayClass][] => {
      const id = displayIds.get(Display);
      return id === undefined ? [] : [[id, specDisplayClass(id)]];
    },
  ),
);

/** A column built: what `TableView.fromSource` takes, or why it cannot be built. */
type BuiltColumn =
  | { ok: true; column: TableViewSourceColumn }
  | { ok: false; issues: MockupIssue[] };

function refused(path: string, message: string): BuiltColumn {
  return { ok: false, issues: [{ path, message }] };
}

type WrittenDataType = ReturnType<typeof displayValuesDataType>;

function dataTypeOf(
  id: string,
  config?: WrittenDataType["config"],
): DataType | undefined {
  try {
    return CreateDataType(id, config);
  } catch {
    return undefined;
  }
}

function withType(
  column: SpecColumn,
  key: string,
  type: DataType | undefined,
  pointer: string,
): BuiltColumn {
  if (!type) {
    return refused(
      `${pointer}/type`,
      `no data type is registered as "${column.type}"`,
    );
  }
  const { display: _display, group: _group, ...options } = column;
  return { ok: true, column: { ...options, name: column.name ?? key, type } };
}

function mappedColumn(
  column: SpecColumn,
  key: string,
  display: MappedDisplay,
  pointer: string,
): BuiltColumn {
  const declared = DECLARATION_OF_TYPE.get(column.type) ?? column.type;
  const refusal = displayRefusal(display, declared);
  if (refusal) return refused(`${pointer}/display`, refusal);
  const written = displayValuesDataType(display);
  return withType(
    column,
    key,
    dataTypeOf(written.$dataType, written.config),
    pointer,
  );
}

function cellColumn(
  column: SpecColumn,
  key: string,
  display: CellDisplay,
  pointer: string,
): BuiltColumn {
  const issues = cellDisplayIssues(display);
  const Display = CELL_DISPLAYS.get(display.type);
  if (issues.length > 0 || !Display) {
    return {
      ok: false,
      issues: issues.map((issue) => ({
        path: `${pointer}/display${issue.path}`,
        message: issue.message,
      })),
    };
  }
  const built = withType(column, key, dataTypeOf(column.type), pointer);
  return built.ok
    ? {
        ok: true,
        column: { ...built.column, display: new Display(display.options) },
      }
    : built;
}

/**
 * The column `key` as `TableView.fromSource` takes it: its data type, the one
 * a badge or price display writes in its place, and its cell display.
 */
export function buildColumn(
  column: SpecColumn,
  key: string,
  pointer: string,
): BuiltColumn {
  const { display } = column;
  if (!display) {
    return withType(column, key, dataTypeOf(column.type), pointer);
  }
  const at = `${pointer}/display`;
  if (Object.hasOwn(display, "kind")) {
    const mapped = mappedDisplaySchema.safeParse(display);
    return mapped.success
      ? mappedColumn(column, key, mapped.data, pointer)
      : { ok: false, issues: zodIssues(at, mapped.error) };
  }
  const cell = cellDisplaySchema.safeParse(display);
  return cell.success
    ? cellColumn(column, key, cell.data, pointer)
    : { ok: false, issues: zodIssues(at, cell.error) };
}
