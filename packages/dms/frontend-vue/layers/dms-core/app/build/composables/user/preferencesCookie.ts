/** @internal */
export interface PreferencesTree {
  [key: string]: unknown;
}

/** @internal */
export const PREFERENCES_COOKIE_NAME = "dms-preferences";

/**
 * @internal
 * The collections that grow with every place the user visits, holding one
 * entry per table view (`tables.<id>`) or per period selector
 * (`periods.<key>`). Over budget, their least recently written entries are
 * dropped, table states first; the rest of the tree is never evicted.
 */
export const EVICTABLE_COLLECTIONS = ["tables", "periods"];

const BASE64_BLOCK = 4;

/** @internal */
export const isBranch = (value: unknown): value is PreferencesTree =>
  !!value && typeof value === "object" && !Array.isArray(value);

const toBase64Url = (text: string): string => {
  const binary = Array.from(new TextEncoder().encode(text), (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const fromBase64Url = (text: string): string => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat(
    (BASE64_BLOCK - (base64.length % BASE64_BLOCK)) % BASE64_BLOCK,
  );
  const binary = atob(`${base64}${padding}`);
  return new TextDecoder().decode(
    Uint8Array.from(binary, (char) => char.charCodeAt(0)),
  );
};

/**
 * @internal
 * The cookie value of a tree: its JSON in base64url, which costs a third more
 * than the JSON where URI-encoding the JSON itself (what the cookie ref does
 * to any value) costs two thirds more, its quotes and braces escaped.
 */
export const encodePreferencesTree = (tree: PreferencesTree): string =>
  Object.keys(tree).length === 0 ? "" : toBase64Url(JSON.stringify(tree));

/**
 * @internal
 * The tree a cookie value holds; an empty one for a value that is not one
 * (corrupt, cut by the browser), so that it never breaks the page.
 */
export const decodePreferencesTree = (value: string): PreferencesTree => {
  if (!value) return {};
  try {
    const tree: unknown = JSON.parse(fromBase64Url(value));
    return isBranch(tree) ? tree : {};
  } catch {
    return {};
  }
};

/**
 * @internal
 * What the cookie weighs in a request header, name included: the cookie ref
 * writes the JSON of its value, URI-encoded.
 */
export const preferencesCookieBytes = (value: unknown): number =>
  `${PREFERENCES_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(value))}`
    .length;

/**
 * @internal
 * Moves each key of `keys` last in its parent, so that the key order of a
 * branch is the order its children were last written in.
 */
export const markWritten = (tree: PreferencesTree, keys: string[]): void => {
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

const dropOldestEvictable = (tree: PreferencesTree): boolean =>
  EVICTABLE_COLLECTIONS.some((collection) => {
    const branch = tree[collection];
    if (!isBranch(branch)) return false;
    const oldestKey = Object.keys(branch)[0];
    if (oldestKey === undefined) return false;
    Reflect.deleteProperty(branch, oldestKey);
    if (Object.keys(branch).length === 0) {
      Reflect.deleteProperty(tree, collection);
    }
    return true;
  });

/**
 * @internal
 * Evicts entries of the growing collections until the encoded tree weighs at
 * most `maxBytes`. Whether it fits in the end: the rest of the tree alone may
 * not.
 */
export const fitPreferencesBudget = (
  tree: PreferencesTree,
  maxBytes: number,
): boolean => {
  while (preferencesCookieBytes(encodePreferencesTree(tree)) > maxBytes) {
    if (!dropOldestEvictable(tree)) return false;
  }
  return true;
};

/** @internal Writes `value` at `keys`, creating the branches on the way. */
export const writeAt = (
  tree: PreferencesTree,
  keys: string[],
  value: unknown,
): void => {
  const lastKey = keys.at(-1)!;
  let current = tree;
  for (const key of keys.slice(0, -1)) {
    if (!isBranch(current[key])) current[key] = {};
    current = current[key] as PreferencesTree;
  }
  current[lastKey] = value;
};

/** @internal Reads the value at `keys`, `undefined` when a branch is missing. */
export const readAt = (tree: PreferencesTree, keys: string[]): unknown => {
  let current: unknown = tree;
  for (const key of keys) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = (current as PreferencesTree)[key];
  }
  return current;
};
