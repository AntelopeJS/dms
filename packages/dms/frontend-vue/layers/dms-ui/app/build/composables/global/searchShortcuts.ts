const GLOBAL_COMPONENT = "$dms.components.global";

/**
 * Focuses the navigation search: the settings menu's on every settings page
 * (and the module search on the Modules page, which has no settings menu).
 */
export const NAV_SEARCH_SHORTCUT = "/";

/**
 * Focuses a page's own search (⌘ / on macOS, Ctrl / elsewhere), so it never
 * competes with "/" for the navigation search. `meta` is read as Ctrl off
 * macOS by `defineShortcuts`. The shifted variant is the same physical keys
 * on layouts where "/" needs Shift (AZERTY: Shift + :), which
 * `defineShortcuts` would otherwise reject as an extra modifier.
 */
export const PAGE_SEARCH_SHORTCUTS = ["meta_/", "meta_shift_/"] as const;

/**
 * The page search keys as hint chips, by `defineShortcuts` key name: print
 * them with `keyboardKeyLabel` ("⌘" "/" on macOS, "Ctrl" "/" elsewhere).
 */
export const PAGE_SEARCH_HINT_KEYS = ["meta", "/"] as const;

/** `aria-keyshortcuts` of an input focused by the page search keys. */
export function pageSearchAriaKeyshortcuts(macOS: boolean): string {
  return macOS ? "Meta+/" : "Control+/";
}

/** `defineShortcuts` map focusing the navigation search on "/". */
export function buildNavSearchShortcuts(
  focus: () => void,
): Record<string, () => void> {
  return { [NAV_SEARCH_SHORTCUT]: focus };
}

/** `defineShortcuts` map focusing a page's own search on ⌘ / or Ctrl /. */
export function buildPageSearchShortcuts(
  focus: () => void,
): Record<string, () => void> {
  return Object.fromEntries(PAGE_SEARCH_SHORTCUTS.map((key) => [key, focus]));
}

/** "/" focuses the navigation search (listed on the shortcuts page). */
export const GLOBAL_SLASH_METADATA: ShortcutMetadata = {
  key: [NAV_SEARCH_SHORTCUT],
  descriptionKey: "$dms.shortcuts.global.slash.description",
  component: GLOBAL_COMPONENT,
  condition: {
    descriptionKey: "$dms.shortcuts.global.slash.condition",
  },
};

/** ⌘ / or Ctrl / focuses the page's own search (listed on the shortcuts page). */
export const GLOBAL_META_SLASH_METADATA: ShortcutMetadata = {
  key: ["$keyboard.meta", "/"],
  descriptionKey: "$dms.shortcuts.global.meta_slash.description",
  component: GLOBAL_COMPONENT,
  condition: {
    descriptionKey: "$dms.shortcuts.global.meta_slash.condition",
  },
};
