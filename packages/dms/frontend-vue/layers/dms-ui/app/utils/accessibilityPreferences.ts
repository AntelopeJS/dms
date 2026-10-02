// Accessibility preferences of the Appearance settings page. Like the theme
// and the density they belong to the device: one cookie, read by the server,
// so the classes they put on `<html>` are in the first paint. The page CSS
// (dms-layout main.css) keys on those classes; JavaScript-driven motion
// (charts) asks `isReducedMotionActive()`.

/**
 * `auto` follows the operating system's `prefers-reduced-motion`; `on` and
 * `off` pin the choice whatever the system says.
 */
export type ReduceMotionPreference = "auto" | "on" | "off";

export interface AccessibilityPreferences {
  reduceMotion: ReduceMotionPreference;
  increaseContrast: boolean;
  underlineLinks: boolean;
}

export const ACCESSIBILITY_COOKIE = "dms-accessibility";

export const DEFAULT_ACCESSIBILITY_PREFERENCES: Readonly<AccessibilityPreferences> =
  Object.freeze({
    reduceMotion: "auto",
    increaseContrast: false,
    underlineLinks: false,
  });

/** The `<html>` classes the preferences map to. */
export const ACCESSIBILITY_HTML_CLASSES = Object.freeze({
  /** Motion pinned off: animations and transitions collapse to ~0ms. */
  reduceMotion: "dms-reduce-motion",
  /** Motion pinned on: the system's reduced-motion setting is ignored. */
  fullMotion: "dms-full-motion",
  increaseContrast: "dms-increase-contrast",
  underlineLinks: "dms-underline-links",
});

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const REDUCE_MOTION_PREFERENCES: ReduceMotionPreference[] = [
  "auto",
  "on",
  "off",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The cookie as a value: already parsed, or the raw (URI-encoded) JSON. */
function decodeCookieValue(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return undefined;
  }
}

function isReduceMotionPreference(
  value: unknown,
): value is ReduceMotionPreference {
  return REDUCE_MOTION_PREFERENCES.includes(value as ReduceMotionPreference);
}

/**
 * Reads the cookie into complete preferences: a missing, malformed or
 * unknown field falls back to its default, so a cookie written by another
 * version never breaks the page.
 */
export function parseAccessibilityPreferences(
  raw: unknown,
): AccessibilityPreferences {
  const value = decodeCookieValue(raw);
  const source = isRecord(value) ? value : {};
  return {
    reduceMotion: isReduceMotionPreference(source.reduceMotion)
      ? source.reduceMotion
      : DEFAULT_ACCESSIBILITY_PREFERENCES.reduceMotion,
    increaseContrast: source.increaseContrast === true,
    underlineLinks: source.underlineLinks === true,
  };
}

/**
 * The `<html>` classes for the preferences. `auto` motion adds none: the CSS
 * follows `prefers-reduced-motion` itself, so the server needs no guess.
 */
export function accessibilityHtmlClasses(
  preferences: AccessibilityPreferences,
): string[] {
  const classes: string[] = [];
  if (preferences.reduceMotion === "on")
    classes.push(ACCESSIBILITY_HTML_CLASSES.reduceMotion);
  if (preferences.reduceMotion === "off")
    classes.push(ACCESSIBILITY_HTML_CLASSES.fullMotion);
  if (preferences.increaseContrast)
    classes.push(ACCESSIBILITY_HTML_CLASSES.increaseContrast);
  if (preferences.underlineLinks)
    classes.push(ACCESSIBILITY_HTML_CLASSES.underlineLinks);
  return classes;
}

/** Whether motion is reduced, given what the system asks for. */
export function resolveReducedMotion(
  preference: ReduceMotionPreference,
  systemPrefersReduced: boolean,
): boolean {
  if (preference === "on") return true;
  if (preference === "off") return false;
  return systemPrefersReduced;
}

/** The motion preference written on `<html>`, `auto` when none is. */
export function reduceMotionFromClasses(
  classList: Pick<DOMTokenList, "contains">,
): ReduceMotionPreference {
  if (classList.contains(ACCESSIBILITY_HTML_CLASSES.reduceMotion)) return "on";
  if (classList.contains(ACCESSIBILITY_HTML_CLASSES.fullMotion)) return "off";
  return "auto";
}

/**
 * Whether the page should skip JavaScript-driven motion right now: the
 * `<html>` class when the user pinned a choice, the system otherwise. Always
 * false on the server, which renders no animation.
 */
export function isReducedMotionActive(): boolean {
  const classList = globalThis.document?.documentElement?.classList;
  if (!classList) return false;
  const systemPrefersReduced =
    typeof matchMedia === "function" &&
    matchMedia(REDUCED_MOTION_QUERY).matches;
  return resolveReducedMotion(
    reduceMotionFromClasses(classList),
    systemPrefersReduced,
  );
}
