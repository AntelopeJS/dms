import { isObject } from "../../utils/type-check";

export interface UserPreferences {
  [key: string]: unknown;
}

const COOKIE_NAME = "user-preferences";
const COOKIE_MAX_AGE_ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * The most the `user-preferences` cookie may weigh, name and URI-encoded value
 * together. Browsers drop a cookie over 4 KB, and every request carries it
 * next to the session cookies under the server's 16 KB header limit.
 */
export const MAX_PREFERENCES_COOKIE_BYTES = 3 * 1024;

/**
 * The collections that grow with every place the user visits, each with the
 * depth of one of its entries: the state of a table view is kept under
 * `tables.<componentId>.<pageId>`, the period of a selector under
 * `periods.<pageId>#<id>`. Over budget, their least recently written entries
 * are dropped, table states first; the rest of the tree is never evicted.
 */
const EVICTABLE_COLLECTIONS: Record<string, number> = { tables: 2, periods: 1 };

const isBranch = (value: unknown): value is UserPreferences =>
  !!value && isObject(value) && !Array.isArray(value);

const cookieBytes = (tree: UserPreferences): number =>
  `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(tree))}`.length;

const isWithinBudget = (tree: UserPreferences): boolean =>
  cookieBytes(tree) <= MAX_PREFERENCES_COOKIE_BYTES;

// A plain copy, as the cookie will read it back: the refs hand out reactive
// proxies, which a caller may keep mutating after the write.
const toPlain = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

/**
 * Moves each key of `keys` last in its parent, so that the key order of a
 * branch is the order its children were last written in.
 */
const markWritten = (tree: UserPreferences, keys: string[]): void => {
  let current = tree;
  for (const key of keys) {
    if (!(key in current)) return;
    const value = current[key];
    Reflect.deleteProperty(current, key);
    current[key] = value;
    if (!isBranch(value)) return;
    current = value;
  }
};

/** Drops the oldest entry `depth` levels down `branch`, and the branches it empties. */
const dropOldestEntry = (branch: UserPreferences, depth: number): boolean => {
  const oldestKey = Object.keys(branch)[0];
  if (oldestKey === undefined) return false;
  const child = branch[oldestKey];
  const isEntry = depth <= 1 || !isBranch(child);
  if (isEntry || !dropOldestEntry(child, depth - 1)) {
    Reflect.deleteProperty(branch, oldestKey);
    return true;
  }
  if (Object.keys(child).length === 0) {
    Reflect.deleteProperty(branch, oldestKey);
  }
  return true;
};

const dropOldestEvictable = (tree: UserPreferences): boolean =>
  Object.entries(EVICTABLE_COLLECTIONS).some(([collection, depth]) => {
    const branch = tree[collection];
    return isBranch(branch) && dropOldestEntry(branch, depth);
  });

/**
 * Evicts entries of the growing collections until the tree fits the cookie.
 * Whether it fits in the end: the rest of the tree alone may not.
 */
const fitBudget = (tree: UserPreferences): boolean => {
  while (!isWithinBudget(tree)) {
    if (!dropOldestEvictable(tree)) return false;
  }
  return true;
};

const writeAt = (
  tree: UserPreferences,
  keys: string[],
  value: unknown,
): void => {
  const lastKey = keys.at(-1)!;
  let current = tree;
  for (const key of keys.slice(0, -1)) {
    if (!isBranch(current[key])) current[key] = {};
    current = current[key] as UserPreferences;
  }
  current[lastKey] = value;
};

/**
 * The user's preferences, kept in the `user-preferences` cookie so that a
 * server render reads them too. The cookie is bounded by
 * `MAX_PREFERENCES_COOKIE_BYTES`: past it, the table view states, then the
 * remembered periods, written least recently are dropped, and a write that
 * would not fit even then is refused.
 */
export const usePreferences = () => {
  const preferenceCookie = useDmsCookie<UserPreferences>(COOKIE_NAME, {
    default: () => ({}),
    maxAge: COOKIE_MAX_AGE_ONE_YEAR,
    sameSite: "lax",
    secure: true,
  });

  // Every write replaces the tree, so the cookie ref, shared by name, is the
  // one source every caller reads.
  const commit = (next: UserPreferences): boolean => {
    if (!fitBudget(next)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[DMS] A preference was not saved: the "${COOKIE_NAME}" cookie would exceed ${MAX_PREFERENCES_COOKIE_BYTES} bytes.`,
        );
      }
      return false;
    }
    preferenceCookie.value = next;
    return true;
  };

  // A cookie written before it was bounded: trimmed on first read, the same
  // way on the server and the client, or cleared when what is never evicted
  // is too large on its own.
  if (!isWithinBudget(preferenceCookie.value)) {
    if (!commit(toPlain(preferenceCookie.value))) preferenceCookie.value = {};
  }

  const getPreference = <T = unknown>(keyPath: string, defaultValue?: T): T => {
    const keys = keyPath.split(".");
    let current: unknown = preferenceCookie.value;

    for (const key of keys) {
      if (current && isObject(current) && key in current) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return defaultValue as T;
      }
    }

    return current as T;
  };

  const setPreference = (keyPath: string, value: unknown): void => {
    const keys = keyPath.split(".");
    const next = toPlain(preferenceCookie.value);
    writeAt(next, keys, toPlain(value));
    markWritten(next, keys);
    commit(next);
  };

  const removePreference = (keyPath: string): void => {
    const keys = keyPath.split(".");
    const lastKey = keys.pop()!;
    const next = toPlain(preferenceCookie.value);

    let current = next;
    for (const key of keys) {
      if (!isBranch(current[key])) return;
      current = current[key];
    }
    if (!(lastKey in current)) return;

    Reflect.deleteProperty(current, lastKey);
    commit(next);
  };

  const updatePreference = <T = unknown>(
    keyPath: string,
    value: Partial<T>,
  ): void => {
    const current = getPreference<T>(keyPath, {} as T);
    const merged = { ...current, ...value };
    setPreference(keyPath, merged);
  };

  const clearAllPreferences = (): void => {
    preferenceCookie.value = {};
  };

  return {
    preferences: readonly(computed(() => preferenceCookie.value)),

    getPreference,
    setPreference,
    updatePreference,
    removePreference,

    clearAllPreferences,
  };
};
