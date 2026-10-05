// Semantic tones shared by the generic v2 building blocks (IconWell,
// StatusPill, EmptyState, CheckList). Tailwind needs literal class strings,
// so every tone maps to a static record instead of `bg-${tone}` interpolation.
// The tints and lines come from the v2 tokens (--dms-*-tint / --dms-*-line,
// both themes) wherever one exists.

/**
 * `accent` and `primary` are the same brand tone (v2 calls it accent, Nuxt UI
 * calls it primary); both are accepted so callers can pass a Nuxt UI color.
 */
export type DmsTone =
  | "neutral"
  | "accent"
  | "primary"
  | "secondary"
  | "success"
  | "warning"
  | "error"
  | "info";

type CanonicalTone = Exclude<DmsTone, "primary">;

const KNOWN_TONES = new Set<string>([
  "neutral",
  "accent",
  "primary",
  "secondary",
  "success",
  "warning",
  "error",
  "info",
]);

/** True when `tone` is one of the semantic tones (not a custom color name). */
export function isDmsTone(tone: string): tone is DmsTone {
  return KNOWN_TONES.has(tone);
}

/** Folds the `primary` alias onto `accent`. */
export function canonicalTone(tone: DmsTone): CanonicalTone {
  return tone === "primary" ? "accent" : tone;
}

/** v2 .icon-well: the tone tint with an inset 1px line of the same tone. */
export const DMS_TONE_WELL: Record<CanonicalTone, string> = {
  neutral: "bg-elevated text-muted ring-(--ui-border-accented)",
  accent: "bg-(--dms-accent-tint) text-primary ring-(--dms-accent-line)",
  secondary: "bg-secondary/10 text-secondary ring-secondary/35",
  success: "bg-(--dms-success-tint) text-success ring-(--dms-success-line)",
  warning: "bg-(--dms-warning-tint) text-warning ring-(--dms-warning-line)",
  error: "bg-(--dms-error-tint) text-error ring-(--dms-error-line)",
  info: "bg-(--dms-info-tint) text-info ring-(--dms-info-line)",
};

/** v2 .status: the tone text on a soft tint of it. */
export const DMS_TONE_SOFT: Record<CanonicalTone, string> = {
  neutral: "bg-elevated text-muted",
  accent: "bg-(--dms-accent-tint) text-primary",
  secondary: "bg-secondary/12 text-secondary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  error: "bg-error/12 text-error",
  info: "bg-info/12 text-info",
};

/** Tone as a text color only. */
export const DMS_TONE_TEXT: Record<CanonicalTone, string> = {
  neutral: "text-muted",
  accent: "text-primary",
  secondary: "text-secondary",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  info: "text-info",
};

/** Tone as a hairline border (outline pills). */
export const DMS_TONE_OUTLINE: Record<CanonicalTone, string> = {
  neutral: "border-(--ui-border-accented)",
  accent: "border-(--dms-accent-line)",
  secondary: "border-secondary/35",
  success: "border-(--dms-success-line)",
  warning: "border-(--dms-warning-line)",
  error: "border-(--dms-error-line)",
  info: "border-(--dms-info-line)",
};

/**
 * The text color of a tone given as a plain string (a backend option); empty
 * for a value that is no tone.
 */
export function toneTextClass(tone: string | undefined): string {
  return tone && isDmsTone(tone) ? DMS_TONE_TEXT[canonicalTone(tone)] : "";
}
