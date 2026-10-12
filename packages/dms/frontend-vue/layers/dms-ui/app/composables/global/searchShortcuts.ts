/**
 * Focuses a page's own search (⌘ / on macOS, Ctrl / elsewhere), so it never
 * competes with "/" for the navigation search. `meta` is read as Ctrl off
 * macOS by `defineShortcuts`. The shifted variant is the same physical keys
 * on layouts where "/" needs Shift (AZERTY: Shift + :), which
 * `defineShortcuts` would otherwise reject as an extra modifier.
 */
export const PAGE_SEARCH_SHORTCUTS = ["meta_/", "meta_shift_/"] as const;

/**
 * `defineShortcuts` map focusing a page's own search on ⌘ / or Ctrl /: the
 * keys a custom page binds its search to, "/" being the navigation
 * search's.
 *
 * @example
 * ```ts
 * defineShortcuts(buildPageSearchShortcuts(() => input.value?.focus()));
 * ```
 */
export function buildPageSearchShortcuts(
  focus: () => void,
): Record<string, () => void> {
  return Object.fromEntries(PAGE_SEARCH_SHORTCUTS.map((key) => [key, focus]));
}
