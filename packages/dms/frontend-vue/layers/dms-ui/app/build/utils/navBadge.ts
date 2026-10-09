import type { Tone } from "../../types/tone";
import { DMS_TONE_SOFT } from "./tone";

/**
 * A page's navigation badge (v2 nav trail count): a small mono pill in the
 * soft tint of the tone its count carries, neutral grey without one. The
 * settings nav draws it after an entry, a nav card in its top corner; where
 * it sits is the caller's.
 */
export function navBadgeClass(tone: Tone | undefined): string {
  return `rounded-full px-1.5 font-mono text-[10.5px] font-semibold tabular-nums ${DMS_TONE_SOFT[tone ?? "neutral"]}`;
}
