import {
  decodePreferencesTree,
  encodePreferencesTree,
  fitPreferencesBudget,
  isBranch,
  markWritten,
  PREFERENCES_COOKIE_NAME,
  readAt,
  writeAt,
  type PreferencesTree,
} from "../../build/composables/user/preferencesCookie";
import { clearLocalTableEntries } from "../../build/composables/user/tablePreferences";
import { isString } from "../../utils/type-check";

export interface UserPreferences extends PreferencesTree {}

const COOKIE_MAX_AGE_ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * The cookie the preferences were kept in up to `@antelopejs/dms` 0.7.9, as
 * URI-encoded JSON that grew with every table the user opened. It is not
 * read: the browser deletes it, so that it stops weighing on every request.
 */
const LEGACY_COOKIE_NAME = "user-preferences";

/**
 * The most the preferences cookie may weigh, name and value together.
 * Browsers drop a cookie over 4 KB, and every request carries it next to the
 * session cookies under the server's 16 KB header limit.
 */
export const MAX_PREFERENCES_COOKIE_BYTES = 3 * 1024;

const toPlain = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));

const expireLegacyCookie = (): void => {
  if (typeof document === "undefined") return;
  const isPresent = document.cookie
    .split(/;\s*/)
    .some((entry) => entry.startsWith(`${LEGACY_COOKIE_NAME}=`));
  if (isPresent) document.cookie = `${LEGACY_COOKIE_NAME}=; path=/; max-age=0`;
};

/**
 * The user's preferences, kept in the `dms-preferences` cookie so that a
 * server render reads them too: a tree addressed by dotted paths, stored as
 * base64url JSON. The cookie is bounded by `MAX_PREFERENCES_COOKIE_BYTES`:
 * past it, the table view states, then the remembered periods, written least
 * recently are dropped, and a write that would not fit even then is refused.
 */
export const usePreferences = () => {
  const preferenceCookie = useDmsCookie<string>(PREFERENCES_COOKIE_NAME, {
    default: () => "",
    maxAge: COOKIE_MAX_AGE_ONE_YEAR,
    sameSite: "lax",
    secure: true,
  });
  expireLegacyCookie();

  const tree = computed<UserPreferences>(() =>
    isString(preferenceCookie.value)
      ? decodePreferencesTree(preferenceCookie.value)
      : {},
  );

  const commit = (next: UserPreferences): boolean => {
    if (!fitPreferencesBudget(next, MAX_PREFERENCES_COOKIE_BYTES)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[DMS] A preference was not saved: the "${PREFERENCES_COOKIE_NAME}" cookie would exceed ${MAX_PREFERENCES_COOKIE_BYTES} bytes.`,
        );
      }
      return false;
    }
    preferenceCookie.value = encodePreferencesTree(next);
    return true;
  };

  const getPreference = <T = unknown>(keyPath: string, defaultValue?: T): T => {
    const value = readAt(tree.value, keyPath.split("."));
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The stored tree does not validate caller-selected T. Returning the tree value type would change the public generic contract; retain existing unchecked reads.
    return (value === undefined ? defaultValue : value) as T;
  };

  const setPreference = (
    keyPath: string,
    value: UserPreferences[string],
  ): void => {
    const keys = keyPath.split(".");
    const next = toPlain(tree.value);
    writeAt(next, keys, toPlain(value));
    markWritten(next, keys);
    commit(next);
  };

  const removePreference = (keyPath: string): void => {
    const keys = keyPath.split(".");
    const lastKey = keys.pop()!;
    const next = toPlain(tree.value);
    const parent = keys.length === 0 ? next : readAt(next, keys);
    if (!isBranch(parent) || !(lastKey in parent)) return;

    Reflect.deleteProperty(parent, lastKey);
    commit(next);
  };

  const updatePreference = <T = unknown>(
    keyPath: string,
    value: Partial<T>,
  ): void => {
    const current = getPreference(keyPath, {});
    const merged = { ...current, ...value };
    setPreference(keyPath, merged);
  };

  const clearAllPreferences = (): void => {
    preferenceCookie.value = "";
    clearLocalTableEntries();
  };

  return {
    preferences: readonly(tree),

    getPreference,
    setPreference,
    updatePreference,
    removePreference,

    clearAllPreferences,
  };
};
