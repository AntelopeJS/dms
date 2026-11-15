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
  type ServerTableFieldValues,
  type TableField,
  TABLES_PREFERENCE_KEY,
  tablePreferenceId,
  writeLocalTableEntry,
} from "#dms-core/app/entries/composables/user/tablePreferences";
import { isBranch } from "#dms-core/app/entries/composables/user/preferencesCookie";

/**
 * The preferences of one table view. A field the server render needs
 * (`ServerTableField`) is read in setup from the cookie, on the server too; a
 * field only the browser draws (`LocalTableField`) reads as its default in
 * setup, on both sides, and is restored from `localStorage` once mounted.
 */
export interface TablePreferences {
  /** A server field's stored value, else `defaultValue`. */
  get: <
    F extends ServerTableField,
    D extends ServerTableFieldValues[F] | undefined,
  >(
    field: F,
    defaultValue: D,
  ) => ServerTableFieldValues[F] | D;
  /** Stores `value`, or forgets the field when `value` is its default. */
  set: <T>(field: TableField, value: T, defaultValue: T) => void;
  /**
   * Sets `state` to the local field's stored value once the table is
   * mounted, unless `isValid` refuses it or `state` already holds it: the
   * server and the hydrating client render the default, so no mismatch.
   */
  restore: <T>(
    field: LocalTableField,
    state: Ref<T>,
    isValid?: (value: T) => boolean,
  ) => void;
}

type StoredValue = ReturnType<typeof readLocalTableEntry>[string];

/** A table state `restore` fills, with the check its caller gave it. */
interface RestoreTarget {
  state: Ref<unknown>;
  isValid?(value: StoredValue): boolean;
}

interface PendingRestore {
  field: LocalTableField;
  apply: (value: StoredValue) => void;
}

const restoreInto = (target: RestoreTarget, restored: StoredValue) => {
  const isUnchanged =
    JSON.stringify(restored) === JSON.stringify(target.state.value);
  if (isUnchanged) return;
  if (target.isValid && !target.isValid(restored)) return;
  target.state.value = restored;
};

/** The table's entry in the cookie: `tables.<id>`, its server fields. */
function useServerTableEntry(id: string) {
  const { getPreference, setPreference, removePreference } = usePreferences();
  const path = `${TABLES_PREFERENCE_KEY}.${id}`;

  const entry = (): CompactTableEntry | undefined => {
    const stored = getPreference(path);
    return isBranch(stored) ? stored : undefined;
  };
  const tables = (): CompactTableEntry => {
    const stored = getPreference(TABLES_PREFERENCE_KEY);
    return isBranch(stored) ? stored : {};
  };

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
      decodeServerField(field, server.entry(), defaultValue),
    set: (field, value, defaultValue) =>
      isServerTableField(field)
        ? server.set(field, value, defaultValue)
        : setLocalField(id, field, value, defaultValue),
    restore: (field, state, isValid) => {
      const target: RestoreTarget = { state, isValid };
      pending.push({ field, apply: (value) => restoreInto(target, value) });
    },
  };
}
