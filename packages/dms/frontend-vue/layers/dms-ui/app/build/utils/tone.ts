// Semantic tones shared by the generic v2 building blocks (IconWell,
// StatusPill, EmptyState, CheckList). Tailwind needs literal class strings,
// so every tone maps to a static record instead of `bg-${tone}` interpolation.
// The tints and lines come from the v2 tokens (--dms-*-tint / --dms-*-line,
// both themes) wherever one exists.

import type { Tone } from "../../types/tone";

/**
 * A tone as a value may still carry it: `accent`, the former name of
 * `primary`, folds onto it.
 */
export type DmsTone = Tone | "accent";

const KNOWN_TONES = new Set<string>([
  "neutral",
  "primary",
  "accent",
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

/** Folds the former `accent` onto `primary`. */
export function canonicalTone(tone: DmsTone): Tone {
  return tone === "accent" ? "primary" : tone;
}

/** v2 .icon-well: the tone tint with an inset 1px line of the same tone. */
export const DMS_TONE_WELL: Record<Tone, string> = {
  neutral: "bg-elevated text-muted ring-(--ui-border-accented)",
  primary: "bg-(--dms-accent-tint) text-primary ring-(--dms-accent-line)",
  secondary: "bg-secondary/10 text-secondary ring-secondary/35",
  success: "bg-(--dms-success-tint) text-success ring-(--dms-success-line)",
  warning: "bg-(--dms-warning-tint) text-warning ring-(--dms-warning-line)",
  error: "bg-(--dms-error-tint) text-error ring-(--dms-error-line)",
  info: "bg-(--dms-info-tint) text-info ring-(--dms-info-line)",
};

/** v2 .status: the tone text on a soft tint of it. */
export const DMS_TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-elevated text-muted",
  primary: "bg-(--dms-accent-tint) text-primary",
  secondary: "bg-secondary/12 text-secondary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  error: "bg-error/12 text-error",
  info: "bg-info/12 text-info",
};

/** Tone as a text color only. */
export const DMS_TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted",
  primary: "text-primary",
  secondary: "text-secondary",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
  info: "text-info",
};

/** Tone as a hairline border (outline pills). */
export const DMS_TONE_OUTLINE: Record<Tone, string> = {
  neutral: "border-(--ui-border-accented)",
  primary: "border-(--dms-accent-line)",
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
