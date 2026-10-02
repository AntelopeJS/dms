import { computed, getCurrentInstance, onMounted, type Ref } from "vue";

/** How keyboard hints are printed: macOS/iOS symbols, or PC key names. */
export type KeyboardPlatform = "mac" | "other";

/**
 * The platform the browser detected, kept in a cookie so the server renders
 * the right hints from the second page on. The server cannot know it before:
 * it only sees the request's cookies.
 */
export const KEYBOARD_PLATFORM_COOKIE = "dms-keyboard-platform";
const KEYBOARD_PLATFORM_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** What the server renders before the browser has said otherwise. */
export const DEFAULT_KEYBOARD_PLATFORM: KeyboardPlatform = "other";

const APPLE_PLATFORM_PATTERN = /mac|iphone|ipad|ipod/i;

/**
 * How each platform prints the modifier and special keys, by `defineShortcuts`
 * key name. A key left out keeps its own name. `meta` is the key Nuxt UI binds
 * to ⌘ on macOS and to Ctrl elsewhere.
 */
export const KEYBOARD_KEY_LABELS: Record<
  KeyboardPlatform,
  Record<string, string>
> = {
  mac: {
    meta: "⌘",
    ctrl: "⌃",
    alt: "⌥",
    shift: "⇧",
    enter: "↵",
    delete: "⌫",
  },
  other: {
    meta: "Ctrl",
    ctrl: "Ctrl",
    alt: "Alt",
  },
};

/** The parts of `navigator` the platform is read from. */
export interface KeyboardPlatformNavigator {
  userAgentData?: { platform?: string };
  platform?: string;
  userAgent?: string;
}

/**
 * The keyboard platform of a browser: macOS and iOS print ⌘, every other one
 * Ctrl. Reads the client hint first, then the legacy `platform`, then the
 * user agent; without a navigator (server) it falls back to the default.
 */
export function detectKeyboardPlatform(
  navigator?: KeyboardPlatformNavigator,
): KeyboardPlatform {
  if (!navigator) return DEFAULT_KEYBOARD_PLATFORM;
  const platform =
    navigator.userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    "";
  return APPLE_PLATFORM_PATTERN.test(platform) ? "mac" : "other";
}

/** A key's label on a platform: "meta" is ⌘ on macOS, Ctrl elsewhere. */
export function keyboardKeyLabel(
  key: string,
  platform: KeyboardPlatform,
): string {
  const label = KEYBOARD_KEY_LABELS[platform][key.toLowerCase()];
  if (label) return label;
  return key.length === 1 ? key.toUpperCase() : key;
}

/**
 * A key combination as one hint: macOS runs its symbols together ("⌘K"),
 * other platforms space the key names ("Ctrl K").
 */
export function formatKeyboardShortcut(
  keys: readonly string[],
  platform: KeyboardPlatform,
): string {
  return keys
    .map((key) => keyboardKeyLabel(key, platform))
    .join(platform === "mac" ? "" : " ");
}

function normalizePlatform(value: unknown): KeyboardPlatform {
  return value === "mac" ? "mac" : "other";
}

/**
 * The keyboard platform every hint renders with, shared by all callers. The
 * server and the hydrating browser both start from the cookie, so their HTML
 * matches; once mounted, the browser detects its platform and, if the cookie
 * was wrong or missing, corrects it, which re-renders the hints in place and
 * lets the next server render get them right. Only labels follow it: the key
 * bindings themselves stay with `defineShortcuts`.
 */
export function useKeyboardPlatform() {
  const stored: Ref<KeyboardPlatform> = useDmsCookie<KeyboardPlatform>(
    KEYBOARD_PLATFORM_COOKIE,
    {
      default: () => DEFAULT_KEYBOARD_PLATFORM,
      maxAge: KEYBOARD_PLATFORM_COOKIE_MAX_AGE,
    },
  );
  if (getCurrentInstance()) {
    onMounted(() => {
      const detected = detectKeyboardPlatform(window.navigator);
      if (stored.value !== detected) stored.value = detected;
    });
  }
  const platform = computed(() => normalizePlatform(stored.value));
  return {
    platform,
    isMac: computed(() => platform.value === "mac"),
    /** A key's label, e.g. `keyLabel("meta")` → "⌘" or "Ctrl". */
    keyLabel: (key: string) => keyboardKeyLabel(key, platform.value),
    /** A combination as one hint, e.g. `["meta", "k"]` → "⌘K" or "Ctrl K". */
    formatShortcut: (keys: readonly string[]) =>
      formatKeyboardShortcut(keys, platform.value),
  };
}
