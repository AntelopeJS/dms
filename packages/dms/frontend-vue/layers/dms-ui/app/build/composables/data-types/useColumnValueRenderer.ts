import { h, type VNodeChild } from "vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";

/**
 * A data type a column borrows for its cells only: the column keeps its own
 * type for forms, filters and validation, and renders through the formatter
 * registered under `type` with `options`.
 */
export interface ColumnDisplay {
  type: string;
  options?: Record<string, unknown>;
}

/** What a column must carry for its values to be rendered. */
export interface RenderableColumn {
  id?: string;
  accessorKey?: PropertyKey;
  type?: DataTypeConfig;
  display?: ColumnDisplay;
}

// v2 cell anatomy: amounts are right-aligned mono figures in the ink color,
// dates 12px muted mono. A data type can give cells a shorter rendering
// through a `cell` formatter (the date type does); others use `default`.
export const NUMERIC_TYPE_IDS = new Set(["number", "price", "percentage"]);
const DATE_TYPE_IDS = new Set(["date"]);
const NUMERIC_CELL_CLASS =
  "block text-right font-mono tabular-nums text-highlighted";
const NUMERIC_EMPTY_CELL_CLASS = "block text-right text-dimmed";
const DATE_CELL_CLASS = "font-mono text-xs text-muted tabular-nums";
const DEFAULT_FALLBACK = "-";
const DETAIL_FALLBACK = "—";

/** Where a value is drawn: a grid cell gets the `cell` formatter first. */
export type ColumnValueSurface = "cell" | "detail";

/**
 * Renders a row's value for a column through the formatter of its data type
 * (or of its `display` data type), the way the grid draws its cells. The row
 * is handed to the formatter as a fourth argument, so a formatter can compose
 * a cell from sibling fields (an avatar next to a name, a badge after it).
 */
export function useColumnValueRenderer() {
  const { getDataType } = useDataTypes();
  const { locale } = useI18n();

  // A display also reads the column's own type options (`typeOptions`): a
  // select's items name the values it draws. A display declared without
  // options reads them at the top level, as it always did.
  const resolveRenderer = (column: RenderableColumn) => {
    const typeOptions = column.type?.inputComponent?.options as
      | Record<string, unknown>
      | undefined;
    if (!column.display)
      return { typeId: column.type?.id, options: typeOptions };
    const displayOptions = column.display.options ?? typeOptions;
    return {
      typeId: column.display.type,
      options: { ...displayOptions, typeOptions },
    };
  };

  /** Whether the column renders right-aligned figures (amounts, numbers). */
  const isNumericColumn = (column: RenderableColumn): boolean => {
    const { typeId } = resolveRenderer(column);
    return !!typeId && !column.display && NUMERIC_TYPE_IDS.has(typeId);
  };

  const renderValue = (
    column: RenderableColumn,
    value: unknown,
    row: Record<string, unknown> | undefined,
    surface: ColumnValueSurface = "cell",
  ): VNodeChild => {
    const { typeId, options } = resolveRenderer(column);
    const isNumeric = isNumericColumn(column);
    const formatter = typeId ? getDataType(typeId)?.formatter : undefined;

    if (value === null || value === undefined) {
      // A data type may draw the absence itself ("Never signed in").
      if (formatter?.empty) {
        return formatter.empty(value, locale.value, options, row) as VNodeChild;
      }
      const fallback =
        (options?.fallback as string) ??
        (surface === "detail" ? DETAIL_FALLBACK : DEFAULT_FALLBACK);
      return isNumeric
        ? h("span", { class: NUMERIC_EMPTY_CELL_CLASS }, fallback)
        : fallback;
    }

    const format =
      (surface === "cell" ? formatter?.cell : undefined) ?? formatter?.default;
    const formatted = format
      ? format(value, locale.value, options, row)
      : value;

    if (typeof formatted !== "string" && typeof formatted !== "number") {
      return formatted as VNodeChild;
    }
    if (isNumeric) {
      return h("span", { class: NUMERIC_CELL_CLASS }, String(formatted));
    }
    if (!column.display && typeId && DATE_TYPE_IDS.has(typeId)) {
      return h("span", { class: DATE_CELL_CLASS }, String(formatted));
    }
    return formatted;
  };

  /** Renders the column's value read off `row`. */
  const renderColumnValue = (
    column: RenderableColumn,
    row: Record<string, unknown>,
    surface: ColumnValueSurface = "cell",
  ): VNodeChild => {
    const key = column.accessorKey ?? column.id;
    const value = key === undefined ? undefined : get(row, String(key));
    return renderValue(column, value, row, surface);
  };

  return { renderValue, renderColumnValue, isNumericColumn };
}
