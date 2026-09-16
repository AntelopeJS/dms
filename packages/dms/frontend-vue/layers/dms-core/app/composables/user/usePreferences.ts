import { isObject } from "../../utils/type-check";

export interface UserPreferences {
  [key: string]: unknown;
}

const COOKIE_NAME = "user-preferences";
const COOKIE_MAX_AGE_ONE_YEAR = 60 * 60 * 24 * 365;

export const usePreferences = () => {
  const preferenceCookie = useDmsCookie<UserPreferences>(COOKIE_NAME, {
    default: () => ({}),
    maxAge: COOKIE_MAX_AGE_ONE_YEAR,
    sameSite: "lax",
    secure: true,
  });

  const preferences = ref<UserPreferences>(preferenceCookie.value);

  const getPreference = <T = unknown>(keyPath: string, defaultValue?: T): T => {
    const keys = keyPath.split(".");
    let current: unknown = preferences.value;

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
    const lastKey = keys.pop()!;

    let current = preferences.value;

    for (const key of keys) {
      if (!current[key] || !isObject(current[key])) {
        current[key] = {};
      }
      current = current[key] as UserPreferences;
    }

    (current as Record<string, unknown>)[lastKey] = value;

    preferenceCookie.value = preferences.value;
  };

  const removePreference = (keyPath: string): void => {
    const keys = keyPath.split(".");
    const lastKey = keys.pop()!;

    let current = preferences.value;

    for (const key of keys) {
      if (!current[key] || !isObject(current[key])) {
        return;
      }
      current = current[key] as UserPreferences;
    }

    if (lastKey in current) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (current as Record<string, unknown>)[lastKey];
    }

    preferenceCookie.value = preferences.value;
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
    preferences.value = {};
    preferenceCookie.value = {};
  };

  return {
    preferences: readonly(computed(() => preferences.value)),

    getPreference,
    setPreference,
    updatePreference,
    removePreference,

    clearAllPreferences,
  };
};
