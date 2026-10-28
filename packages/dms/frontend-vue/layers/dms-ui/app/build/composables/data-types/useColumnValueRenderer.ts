import { h, type VNodeChild } from "vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import type { DataTypeFormatter } from "#dms-core/app/composables/data-types/useDataType";
import { isNumber, isString } from "#dms-core/app/utils/type-check";

/**
 * A data type a column borrows for its cells only: the column keeps its own
 * type for forms, filters and validation, and renders through the formatter
 * registered under `type` with `options`.
 */
export interface ColumnDisplay {
  type: string;
  options?: NonNullable<Parameters<DataTypeFormatter>[3]>;
}

interface ResolvedColumnRenderer {
  typeId: string | undefined;
  options: ColumnDisplay["options"];
}

/** What a column must carry for its values to be rendered. */
export interface RenderableColumn {
  id?: string;
  accessorKey?: PropertyKey;
  type?: DataTypeConfig;
  display?: ColumnDisplay;
}

export const NUMERIC_TYPE_IDS = new Set(["number", "price", "percentage"]);
const DATE_TYPE_IDS = new Set(["date"]);
const NUMERIC_CELL_CLASS =
  "block text-right font-mono tabular-nums text-highlighted";
const DETAIL_NUMERIC_CELL_CLASS = "block text-right tabular-nums";
const NUMERIC_EMPTY_CELL_CLASS = "block text-right text-dimmed";
const DATE_CELL_CLASS = "font-mono text-xs text-muted tabular-nums";
const DEFAULT_FALLBACK = "-";
const DETAIL_FALLBACK = "—";

/** Where a value is drawn: a grid cell gets the `cell` formatter first. */
export type ColumnValueSurface = "cell" | "detail";

function renderEmptyFallback(
  options: ResolvedColumnRenderer["options"],
  surface: ColumnValueSurface,
  isNumeric: boolean,
): VNodeChild {
  const fallback =
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Plugin options have no fallback schema; this preserves the unchecked value rather than coercing or rejecting malformed inputs.
    (options?.fallback as string) ??
    (surface === "detail" ? DETAIL_FALLBACK : DEFAULT_FALLBACK);
  return isNumeric
    ? h("span", { class: NUMERIC_EMPTY_CELL_CLASS }, fallback)
    : fallback;
}

/**
 * Renders a row's value for a column through the formatter of its data type
 * (or of its `display` data type), the way the grid draws its cells. The row
 * is handed to the formatter as a fourth argument, so a formatter can compose
 * a cell from sibling fields (an avatar next to a name, a badge after it).
 */
export function useColumnValueRenderer() {
  const { getDataType } = useDataTypes();
  const { locale } = useI18n();

  const resolveRenderer = (
    column: RenderableColumn,
  ): ResolvedColumnRenderer => {
    const typeOptions = column.type?.inputComponent?.options;
    if (!column.display)
      return { typeId: column.type?.id, options: typeOptions };
    const displayOptions = column.display.options ?? typeOptions;
    return {
      typeId: column.display.type,
      options: { ...displayOptions, typeOptions, columnType: column.type?.id },
    };
  };

  /** Whether the column renders right-aligned figures (amounts, numbers). */
  const isNumericColumn = (column: RenderableColumn): boolean => {
    const { typeId } = resolveRenderer(column);
    return !!typeId && !column.display && NUMERIC_TYPE_IDS.has(typeId);
  };

  const renderValue = (
    column: RenderableColumn,
    value: Parameters<DataTypeFormatter>[0],
    row: Parameters<DataTypeFormatter>[3],
    surface: ColumnValueSurface = "cell",
  ): VNodeChild => {
    const { typeId, options } = resolveRenderer(column);
    const isNumeric = isNumericColumn(column);
    const formatter = typeId ? getDataType(typeId)?.formatter : undefined;

    if (value === null || value === undefined) {
      if (formatter?.empty) {
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- DataTypeFormatter returns unknown for plugin extensions; the existing render boundary forwards it without VNodeChild validation.
        return formatter.empty(value, locale.value, options, row) as VNodeChild;
      }
      return renderEmptyFallback(options, surface, isNumeric);
    }

    const format =
      (surface === "cell" ? formatter?.cell : undefined) ?? formatter?.default;
    const formatted = format
      ? format(value, locale.value, options, row)
      : value;

    if (!isString(formatted) && !isNumber(formatted)) {
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Excluding strings and numbers does not validate a VNodeChild; preserve the existing unchecked plugin result handoff.
      return formatted as VNodeChild;
    }
    if (isNumeric) {
      const numericClass =
        surface === "detail" ? DETAIL_NUMERIC_CELL_CLASS : NUMERIC_CELL_CLASS;
      return h("span", { class: numericClass }, String(formatted));
    }
    if (!column.display && typeId && DATE_TYPE_IDS.has(typeId)) {
      return h("span", { class: DATE_CELL_CLASS }, String(formatted));
    }
    return formatted;
  };

  /** Renders the column's value read off `row`. */
  const renderColumnValue = (
    column: RenderableColumn,
    row: NonNullable<Parameters<DataTypeFormatter>[3]>,
    surface: ColumnValueSurface = "cell",
  ): VNodeChild => {
    const key = column.accessorKey ?? column.id;
    const value = key === undefined ? undefined : get(row, String(key));
    return renderValue(column, value, row, surface);
  };

  return { renderValue, renderColumnValue, isNumericColumn };
}
