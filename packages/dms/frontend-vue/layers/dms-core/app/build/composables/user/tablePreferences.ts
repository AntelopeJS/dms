import type {
  PaginationState,
  SortingState,
  VisibilityState,
} from "@tanstack/vue-table";
import { isBranch, type PreferencesTree } from "./preferencesCookie";
import { isNumber, isString } from "../../../utils/type-check";

/** @internal A filter of a table view, as `TableFilter` shapes it. */
export interface FilterEntry {
  accessorKey: string;
  value?: unknown;
  mode: string;
  pinned?: boolean;
  initialValue?: unknown;
}

/**
 * @internal
 * The state of a table view that the server render reads to list and draw
 * the right rows: kept in the preferences cookie, compactly. Each field maps
 * to the type of its value.
 */
export interface ServerTableValues {
  sorting: SortingState;
  columnFilters: FilterEntry[];
  columnVisibility: VisibilityState;
  pagination: PaginationState;
  paginationScope: string;
  activeTab: string;
  viewMode: string;
  activeView: string;
  linkScope: string;
  shownLink: string;
}

/** @internal The fields kept in the preferences cookie. */
export type ServerTableField = keyof ServerTableValues;

/**
 * @internal
 * The state of a table view that only the browser draws: kept in
 * `localStorage`, applied once the table is mounted.
 */
export type LocalTableField =
  | "columnOrder"
  | "columnSizing"
  | "density"
  | "filtersOpen"
  | "kanbanGroupBy"
  | "groupedGroupBy"
  | "userViews";

/** @internal */
export type TableField = ServerTableField | LocalTableField;

/** @internal A table's entry in the cookie, by short field key. */
export type CompactTableEntry = PreferencesTree;

/** @internal The collection of the preferences tree holding table entries. */
export const TABLES_PREFERENCE_KEY = "tables";

/** @internal The prefix of a table's `localStorage` key, versioned. */
export const LOCAL_TABLE_KEY_PREFIX = "dms-table-preferences:v1:";

const TABLE_ID_LENGTH = 8;
const HASH_SEEDS: [number, number] = [0xdeadbeef, 0x41c6ce57];
const HASH_MULTIPLIERS = [2654435761, 1597334677];
const HASH_MIX = [2246822507, 3266489909];
const HASH_RADIX = 36;
const HIGH_BITS = 2097151;
const HIGH_BITS_SHIFT = 4294967296;
const DESCENDING_PREFIX = "-";
const HIDDEN_PREFIX = "-";
const SHOWN_PREFIX = "+";
const DEFAULT_FILTER_MODE = "is";
const FIRST_PAGE_INDEX = 0;

/**
 * @internal
 * A 53-bit hash of `text` in base 36 (cyrb53): short, stable on the server
 * and in the browser.
 */
export const hashText = (text: string): string => {
  let [first, second] = HASH_SEEDS;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, HASH_MULTIPLIERS[0]!);
    second = Math.imul(second ^ code, HASH_MULTIPLIERS[1]!);
  }
  first = Math.imul(first ^ (first >>> 16), HASH_MIX[0]!);
  first ^= Math.imul(second ^ (second >>> 13), HASH_MIX[1]!);
  second = Math.imul(second ^ (second >>> 16), HASH_MIX[0]!);
  second ^= Math.imul(first ^ (first >>> 13), HASH_MIX[1]!);
  return (HIGH_BITS_SHIFT * (HIGH_BITS & second) + (first >>> 0)).toString(
    HASH_RADIX,
  );
};

/**
 * @internal
 * The short key of a table view's preferences: its component and its page,
 * hashed, so that neither a long id nor a dotted page id reaches the cookie.
 */
export const tablePreferenceId = (
  componentId: string,
  pageId: string,
): string =>
  hashText(`${componentId}\u0000${pageId}`)
    .padStart(TABLE_ID_LENGTH, "0")
    .slice(0, TABLE_ID_LENGTH);

/**
 * @internal
 * How a server field's value of type `V` is kept: its key in the table's
 * entry, and its compact form. `encode` gets the field's default so that it
 * can keep only what differs from it; a value whose form equals the default's
 * is not written. `decode` throws on a stored value that is not a `V`'s form.
 */
export interface ServerFieldCodec<V> {
  key: string;
  encode: (value: V, defaultValue: V | undefined) => PreferencesTree[string];
  decode: (stored: PreferencesTree[string], defaultValue: V | undefined) => V;
}

const encodeSorting: ServerFieldCodec<SortingState>["encode"] = (value) => {
  const tokens = value.map(
    (sort) => `${sort.desc ? DESCENDING_PREFIX : ""}${sort.id}`,
  );
  return tokens.length === 1 ? tokens[0] : tokens;
};

const decodeSorting = (stored: PreferencesTree[string]): SortingState => {
  const tokens = isString(stored) ? [stored] : stored;
  if (!Array.isArray(tokens)) throw new TypeError("sorting");
  return tokens.map((token: string) => ({
    id: token.startsWith(DESCENDING_PREFIX) ? token.slice(1) : token,
    desc: token.startsWith(DESCENDING_PREFIX),
  }));
};

const isSameValue = <V>(left: V, right: V): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const encodeFilters: ServerFieldCodec<FilterEntry[]>["encode"] = (value) =>
  value
    .filter(
      (filter) =>
        !filter.pinned || !isSameValue(filter.value, filter.initialValue),
    )
    .map((filter) =>
      filter.mode === DEFAULT_FILTER_MODE
        ? [filter.accessorKey, filter.value ?? null]
        : [filter.accessorKey, filter.value ?? null, filter.mode],
    );

const decodeFilters = (stored: PreferencesTree[string]): FilterEntry[] => {
  if (!Array.isArray(stored)) throw new TypeError("columnFilters");
  return stored.map(([accessorKey, value, mode]: unknown[]) => ({
    accessorKey: String(accessorKey),
    value,
    mode: isString(mode) ? mode : DEFAULT_FILTER_MODE,
  }));
};

const encodeVisibility: ServerFieldCodec<VisibilityState>["encode"] = (
  value,
  defaultValue,
) => {
  const defaults = defaultValue ?? {};
  return Object.entries(value)
    .filter(([column, isShown]) => isShown !== (defaults[column] ?? true))
    .map(
      ([column, isShown]) =>
        `${isShown ? SHOWN_PREFIX : HIDDEN_PREFIX}${column}`,
    );
};

const decodeVisibility: ServerFieldCodec<VisibilityState>["decode"] = (
  stored,
  defaultValue,
) => {
  if (!Array.isArray(stored)) throw new TypeError("columnVisibility");
  const changes = stored.map((token: string): [string, boolean] => [
    token.slice(1),
    token.startsWith(SHOWN_PREFIX),
  ]);
  return { ...defaultValue, ...Object.fromEntries(changes) };
};

const encodePagination: ServerFieldCodec<PaginationState>["encode"] = (
  value,
) => {
  const { pageIndex, pageSize } = value;
  return pageIndex === FIRST_PAGE_INDEX ? pageSize : [pageSize, pageIndex];
};

const decodePagination = (stored: PreferencesTree[string]): PaginationState => {
  const pair: unknown[] = Array.isArray(stored)
    ? stored
    : [stored, FIRST_PAGE_INDEX];
  const [pageSize, pageIndex] = pair;
  if (!isNumber(pageSize) || !isNumber(pageIndex)) {
    throw new TypeError("pagination");
  }
  return { pageIndex, pageSize };
};

const stringField = (key: string): ServerFieldCodec<string> => ({
  key,
  encode: (value) => value,
  decode: (stored) => {
    if (!isString(stored)) throw new TypeError(key);
    return stored;
  },
});

/**
 * @internal
 * The server fields, each with its one-letter key and compact form: a sort is
 * `"-name"`, a filter `["status", "open"]`, a hidden column `"-email"`, a
 * page size `50`.
 */
export const SERVER_TABLE_FIELDS = {
  sorting: { key: "s", encode: encodeSorting, decode: decodeSorting },
  columnFilters: { key: "f", encode: encodeFilters, decode: decodeFilters },
  columnVisibility: {
    key: "v",
    encode: encodeVisibility,
    decode: decodeVisibility,
  },
  pagination: { key: "p", encode: encodePagination, decode: decodePagination },
  paginationScope: stringField("q"),
  activeTab: stringField("t"),
  viewMode: stringField("d"),
  activeView: stringField("w"),
  linkScope: stringField("l"),
  shownLink: stringField("k"),
} satisfies {
  [F in ServerTableField]: ServerFieldCodec<ServerTableValues[F]>;
};

/**
 * @internal
 * `value`'s form in the entry, or `undefined` when it equals the default's
 * and is not to be written.
 */
export const encodeServerField = <V>(
  codec: ServerFieldCodec<V>,
  value: V | undefined,
  defaultValue: V | undefined,
): PreferencesTree[string] => {
  if (value === undefined) return undefined;
  const encoded = codec.encode(value, defaultValue);
  const encodedDefault =
    defaultValue === undefined
      ? undefined
      : codec.encode(defaultValue, defaultValue);
  return isSameValue(encoded, encodedDefault) ? undefined : encoded;
};

/**
 * @internal
 * The value `entry` keeps under `codec`, else `defaultValue`: also when
 * what it keeps is not a form the codec reads.
 */
export const decodeServerField = <V, D extends V | undefined>(
  codec: ServerFieldCodec<V>,
  entry: CompactTableEntry | undefined,
  defaultValue: D,
): V | D => {
  const stored = entry?.[codec.key];
  if (stored === undefined) return defaultValue;
  try {
    return codec.decode(stored, defaultValue);
  } catch {
    return defaultValue;
  }
};

/** @internal Whether `value` is the field's default, not to be written. */
export const isDefaultValue = <V>(
  value: V | undefined,
  defaultValue: V | undefined,
): boolean => value === undefined || isSameValue(value, defaultValue);

const localKey = (id: string): string => `${LOCAL_TABLE_KEY_PREFIX}${id}`;

const browserStorage = (): Storage | undefined =>
  typeof localStorage === "undefined" ? undefined : localStorage;

/**
 * @internal
 * The browser-only state of a table; empty on the server, or when the
 * storage is unavailable or holds something else.
 */
export const readLocalTableEntry = (id: string): PreferencesTree => {
  try {
    const stored = browserStorage()?.getItem(localKey(id));
    const entry: unknown = stored ? JSON.parse(stored) : {};
    return isBranch(entry) ? entry : {};
  } catch {
    return {};
  }
};

/**
 * @internal
 * Writes the browser-only state of a table, removing its key once empty.
 * Answers whether the storage took it: `false` on the server, or when the
 * storage refuses the write (full, disabled), which leaves the table as it is.
 */
export const writeLocalTableEntry = (
  id: string,
  entry: PreferencesTree,
): boolean => {
  try {
    const storage = browserStorage();
    if (!storage) return false;
    if (Object.keys(entry).length === 0) storage.removeItem(localKey(id));
    else storage.setItem(localKey(id), JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
};

/** @internal Drops the browser-only state of every table. */
export const clearLocalTableEntries = (): void => {
  const storage = browserStorage();
  if (!storage) return;
  Object.keys(storage)
    .filter((key) => key.startsWith(LOCAL_TABLE_KEY_PREFIX))
    .forEach((key) => storage.removeItem(key));
};
