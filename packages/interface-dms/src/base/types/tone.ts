import * as tones from "../../tones";

export import TONES = tones.TONES;
export type { Tone } from "../../tones";

/**
 * The tones of an icon well: the semantic ones plus `muted`, the quiet well
 * of a settings row or a status strip cell.
 */
export const ICON_TONES = [...TONES, "muted"] as const;

export type IconTone = (typeof ICON_TONES)[number];
