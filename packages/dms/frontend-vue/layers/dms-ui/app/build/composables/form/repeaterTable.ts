import type {
  DataType,
  DataTypeSelectSource,
} from "#dms-core/app/composables/data-types/useDataType";
import type { RenderableColumn } from "../data-types/useColumnValueRenderer";
import { NotFoundRelation } from "../data-types/relationRows";

/** A column of a read-only list: a field of its rows. */
export interface RepeaterTableColumn {
  id: string;
  label?: string;
  type?: string;
  component: ComponentInfo;
}

/** Where a relation column reads the rows its values name. */
export interface RelationLabelSource extends DataTypeSelectSource {
  multiple: boolean;
}

/**
 * The column as the grid's cell renderer reads it: its data type, with the
 * options of its control (a select's items, a relation's key mapping).
 */
export function renderableColumn(
  column: RepeaterTableColumn,
): RenderableColumn {
  const type: DataTypeConfig = {
    id: column.type ?? "",
    compareModes: [],
    filterComponents: {},

    inputComponent: column.component as ComponentInfo<ComponentOptionsData>,
  };
  return { id: column.id, type };
}

/**
 * The rows a relation column names its values from, if its data type reads
 * its labels from a `select` route ({@link DataType.selectSource}).
 */
export function relationLabelSource(
  column: RepeaterTableColumn,
  dataType: Pick<DataType, "selectSource"> | undefined,
): RelationLabelSource | undefined {
  const options = column.component.options as
    | { multiple?: unknown }
    | undefined;
  const source = dataType?.selectSource?.(options);
  return source ? { ...source, multiple: !!options?.multiple } : undefined;
}

/** The rows a relation column's read answered, by value, and the ids it asked. */
export interface RelationColumnRows {
  rowsByValue: ReadonlyMap<unknown, Record<string, unknown>>;
  readIds: ReadonlySet<string>;
}

/**
 * A relation value as its formatter draws it: the related row in place of
 * each id it holds. An id the read asked for and no row answers (deleted, out
 * of reach) is not found; one not asked yet stays as it is, as does a value
 * the server already joined.
 */
export function joinRelationValue(
  value: unknown,
  { rowsByValue, readIds }: RelationColumnRows,
  multiple: boolean,
): unknown {
  const join = (item: unknown) => {
    const row = rowsByValue.get(item);
    if (row) return row;
    const id = String(item);
    return readIds.has(id) ? new NotFoundRelation(id) : item;
  };
  if (multiple && Array.isArray(value)) return value.map(join);
  return join(value);
}
