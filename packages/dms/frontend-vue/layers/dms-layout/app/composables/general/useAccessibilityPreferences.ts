import { computed, type ComputedRef, type WritableComputedRef } from "vue";
import {
  ACCESSIBILITY_COOKIE,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  parseAccessibilityPreferences,
  type AccessibilityPreferences,
  type ReduceMotionPreference,
} from "#dms-ui/app/build/utils/accessibilityPreferences";

const ACCESSIBILITY_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface AccessibilityPreferencesRefs {
  /** The complete preferences, read from the cookie. */
  preferences: ComputedRef<AccessibilityPreferences>;
  reduceMotion: WritableComputedRef<ReduceMotionPreference>;
  increaseContrast: WritableComputedRef<boolean>;
  underlineLinks: WritableComputedRef<boolean>;
}

/**
 * The accessibility preferences of this device, from the `dms-accessibility`
 * cookie shared by every caller. Each field is a writable ref: assigning it
 * rewrites the cookie, and the `<html>` classes follow. The server reads the
 * same cookie, so the first paint already has them.
 */
export const useAccessibilityPreferences = (): AccessibilityPreferencesRefs => {
  const cookie = useDmsCookie<AccessibilityPreferences>(ACCESSIBILITY_COOKIE, {
    default: () => ({ ...DEFAULT_ACCESSIBILITY_PREFERENCES }),
    maxAge: ACCESSIBILITY_COOKIE_MAX_AGE,
  });
  const preferences = computed(() =>
    parseAccessibilityPreferences(cookie.value),
  );

  function field<K extends keyof AccessibilityPreferences>(
    key: K,
  ): WritableComputedRef<AccessibilityPreferences[K]> {
    return computed({
      get: () => preferences.value[key],
      set: (value) => {
        cookie.value = { ...preferences.value, [key]: value };
      },
    });
  }

  return {
    preferences,
    reduceMotion: field("reduceMotion"),
    increaseContrast: field("increaseContrast"),
    underlineLinks: field("underlineLinks"),
  };
};
