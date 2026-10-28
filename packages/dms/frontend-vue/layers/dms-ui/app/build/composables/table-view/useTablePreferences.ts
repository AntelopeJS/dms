import { getCurrentInstance, onMounted, type Ref } from "vue";
import {
  type CompactTableEntry,
  decodeServerField,
  encodeServerField,
  isDefaultValue,
  isServerTableField,
  type LocalTableField,
  readLocalTableEntry,
  SERVER_TABLE_FIELDS,
  type ServerTableField,
  type TableField,
  TABLES_PREFERENCE_KEY,
  tablePreferenceId,
  writeLocalTableEntry,
} from "#dms-core/app/entries/composables/user/tablePreferences";

/**
 * The preferences of one table view. A field the server render needs
 * (`ServerTableField`) is read in setup from the cookie, on the server too; a
 * field only the browser draws (`LocalTableField`) reads as its default in
 * setup, on both sides, and is restored from `localStorage` once mounted.
 */
export interface TablePreferences {
  /** A server field's stored value, else `defaultValue`; a local field's default. */
  get: <T>(field: TableField, defaultValue: T) => T;
  /** Stores `value`, or forgets the field when `value` is its default. */
  set: <T>(field: TableField, value: T, defaultValue: T) => void;
  /**
   * Sets `state` to the local field's stored value once the table is
   * mounted, unless `isValid` refuses it: the server and the hydrating
   * client render the default, so no mismatch.
   */
  restore: <T>(
    field: LocalTableField,
    state: Ref<T>,
    isValid?: (value: T) => boolean,
  ) => void;
}

interface PendingRestore {
  field: LocalTableField;
  apply: (value: ReturnType<typeof readLocalTableEntry>[string]) => void;
}

/** The table's entry in the cookie: `tables.<id>`, its server fields. */
function useServerTableEntry(id: string) {
  const { getPreference, setPreference, removePreference } = usePreferences();
  const path = `${TABLES_PREFERENCE_KEY}.${id}`;

  const entry = (): CompactTableEntry | undefined =>
    getPreference<CompactTableEntry | undefined>(path, undefined);
  const tables = () =>
    getPreference<CompactTableEntry>(TABLES_PREFERENCE_KEY, {});

  const forget = () => {
    const isLastEntry = Object.keys(tables()).every((key) => key === id);
    removePreference(isLastEntry ? TABLES_PREFERENCE_KEY : path);
  };

  const set = (
    field: ServerTableField,
    value: Parameters<typeof encodeServerField>[1],
    defaultValue: Parameters<typeof encodeServerField>[2],
  ) => {
    const { key } = SERVER_TABLE_FIELDS[field];
    const next = { ...entry() };
    const encoded = encodeServerField(field, value, defaultValue);
    if (JSON.stringify(next[key]) === JSON.stringify(encoded)) return;
    if (encoded === undefined) Reflect.deleteProperty(next, key);
    else next[key] = encoded;
    if (Object.keys(next).length === 0) forget();
    else setPreference(path, next);
  };

  const markUsed = () => {
    const current = entry();
    if (current && Object.keys(tables()).at(-1) !== id) {
      setPreference(path, current);
    }
  };

  return { entry, set, markUsed };
}

const setLocalField = (
  id: string,
  field: LocalTableField,
  value: Parameters<typeof isDefaultValue>[0],
  defaultValue: Parameters<typeof isDefaultValue>[1],
) => {
  const entry = readLocalTableEntry(id);
  if (isDefaultValue(value, defaultValue)) {
    Reflect.deleteProperty(entry, field);
  } else {
    entry[field] = JSON.parse(JSON.stringify(value));
  }
  writeLocalTableEntry(id, entry);
};

const restoreLocalFields = (id: string, pending: PendingRestore[]) => {
  const stored = readLocalTableEntry(id);
  pending
    .filter(({ field }) => stored[field] !== undefined)
    .forEach(({ field, apply }) => apply(stored[field]));
};

/**
 * The preferences of the table view `componentId` on page `pageId`, under a
 * short hash of both: the cookie entry `tables.<id>`, and the
 * `localStorage` key `dms-table-preferences:v1:<id>`.
 */
export function useTablePreferences(
  componentId: string | undefined,
  pageId: string | undefined,
): TablePreferences {
  const id = tablePreferenceId(componentId ?? "", pageId ?? "");
  const server = useServerTableEntry(id);
  const pending: PendingRestore[] = [];

  if (getCurrentInstance()) {
    onMounted(() => {
      restoreLocalFields(id, pending);
      server.markUsed();
    });
  }

  return {
    get: (field, defaultValue) =>
      isServerTableField(field)
        ? decodeServerField(field, server.entry(), defaultValue)
        : defaultValue,
    set: (field, value, defaultValue) =>
      isServerTableField(field)
        ? server.set(field, value, defaultValue)
        : setLocalField(id, field, value, defaultValue),
    restore: (field, state, isValid) => {
      pending.push({
        field,
        apply: (value) => {
          // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Storage returns arbitrary preference values, while restore accepts caller-selected T and an optional boolean validator. Neither owner proves T; adding mandatory validation would change restoration behavior.
          const restored = value as typeof state.value;
          if (!isValid || isValid(restored)) state.value = restored;
        },
      });
    },
  };
}
