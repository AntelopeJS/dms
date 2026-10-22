/**
 * The mono uppercase label of the design (.eyebrow) at its 10.5px size, for
 * the places `DmsEyebrow` cannot go: a theme slot, a `tv()` slot, a table
 * head. Its colour is the caller's.
 */
export const EYEBROW_CLASS =
  "font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase";

/** U+2060: no line break on either side, and no glyph to draw. */
const WORD_JOINER = "⁠";
const INNER_HYPHEN = /(?<=\p{L})-(?=\p{L})/gu;

/**
 * `label` with each hyphenated word kept on one line: a short label that wraps
 * on a phone breaks between words, never as "MOIS-" over "CI".
 */
export function keepHyphenatedWords(label: string): string {
  return label.replace(INNER_HYPHEN, `-${WORD_JOINER}`);
}
