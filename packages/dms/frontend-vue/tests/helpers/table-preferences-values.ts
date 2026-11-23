import type {
  TablePreferences,
  TablePreferenceValues,
} from "../../layers/dms-ui/app/entries/composables/table-view/useTablePreferences";

/** A `get` answering from `values`: the fallback for a field they leave out. */
export const readFrom =
  (values: Partial<TablePreferenceValues>): TablePreferences["get"] =>
  (field, fallback) => {
    const stored = values[field];
    return stored === undefined ? fallback : stored;
  };

/** A `set` writing into `values`, and removing the field it is given `undefined` for. */
export const writeInto =
  (values: Partial<TablePreferenceValues>): TablePreferences["set"] =>
  (field, value) => {
    if (value === undefined) Reflect.deleteProperty(values, field);
    else values[field] = value;
  };
