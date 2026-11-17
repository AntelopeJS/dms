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
