/**
 * The semantic tones of the dashboard, the colour names of Nuxt UI. A clickable
 * thing (a button, a row action, a tab) takes one as its `color`; a thing that
 * shows a state (a pill, an icon well, a banner, a meter, a notification) as its
 * `tone`. A block that supports fewer narrows the union with `Extract<>`.
 */
export const TONES = [
  "neutral",
  "primary",
  "secondary",
  "success",
  "warning",
  "error",
  "info",
] as const;

export type Tone = (typeof TONES)[number];

/**
 * The tones of an icon well: the semantic ones plus `muted`, the quiet well
 * of a settings row or a status strip cell.
 */
export const ICON_TONES = [...TONES, "muted"] as const;

export type IconTone = (typeof ICON_TONES)[number];
