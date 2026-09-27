// Overlays reka-ui dismisses on Escape (modals, slideovers, popovers, menus,
// selects). They move focus inside themselves while open.
const OVERLAY_SELECTOR =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Nuxt UI's `defineShortcuts` calls `preventDefault()` on every key it
 * handles, and reka-ui's DismissableLayer ignores a prevented Escape. A
 * component-level Escape shortcut must therefore stay unregistered while
 * focus sits inside an overlay, so the overlay keeps closing on Escape.
 */
export function isFocusInsideOverlay(
  activeElement: Element | null | undefined,
): boolean {
  return Boolean(activeElement?.closest(OVERLAY_SELECTOR));
}
