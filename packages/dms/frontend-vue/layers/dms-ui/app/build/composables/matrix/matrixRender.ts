import type { BlockText } from "#dms-core/app/types/composed-text";
import type { MatrixCellKind, MatrixColumn } from "../../../types/matrix";
import type { RenderableColumn } from "../data-types/useColumnValueRenderer";
import { kindOf } from "./matrixValues";

/** The DMS data type a kind's values are drawn with, as a table view draws them. */
const RENDER_TYPE_IDS: Partial<Record<MatrixCellKind, string>> = {
  number: "number",
  boolean: "boolean",
  date: "date",
  select: "select",
  tags: "select",
};
const FALLBACK_TYPE_ID = "string";

/** A select option as a data type's `items` read it: value, label, icon. */
type MatrixRenderItem = Record<string, string>;

/**
 * A Matrix column as the DMS's value renderer takes it: its `display`, and a
 * data type built from its kind whose options are the column's choices, so
 * a display drawing a select's value (`status_pill`) shows their labels.
 */
export function matrixRenderColumn(
  column: MatrixColumn,
  text: (value: BlockText) => string,
): RenderableColumn {
  const items: MatrixRenderItem[] = (column.options ?? []).map((option) => ({
    value: option.value,
    label: text(option.label),
    ...(option.icon && { icon: option.icon }),
  }));
  return {
    id: column.id,
    display: column.display,
    type: {
      id: RENDER_TYPE_IDS[kindOf(column)] ?? FALLBACK_TYPE_ID,
      compareModes: [],
      filterComponents: {},
      inputComponent: { options: { items } },
    },
  };
}
