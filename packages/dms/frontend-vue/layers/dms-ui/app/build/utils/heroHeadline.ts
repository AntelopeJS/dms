/** A run of a hero's headline, drawn highlighted or not. */
export interface HeadlineSegment {
  text: string;
  isHighlighted: boolean;
}

const EMPHASIS_PATTERN = /\*([^*]+)\*/g;
// Not global: a global pattern's `test` would carry its position over.
const HAS_EMPHASIS = /\*[^*]+\*/;

/**
 * Splits a headline into the runs it draws: the words it wraps in
 * `*asterisks*` are highlighted; without any, the first occurrence of
 * `highlight` is. A headline with neither is one plain run.
 */
export function splitHeadline(
  headline: string,
  highlight?: string,
): HeadlineSegment[] {
  if (HAS_EMPHASIS.test(headline)) return splitEmphasis(headline);
  const start = highlight ? headline.indexOf(highlight) : -1;
  if (!highlight || start < 0)
    return [{ text: headline, isHighlighted: false }];
  const end = start + highlight.length;
  return [
    { text: headline.slice(0, start), isHighlighted: false },
    { text: highlight, isHighlighted: true },
    { text: headline.slice(end), isHighlighted: false },
  ].filter((segment) => segment.text);
}

function splitEmphasis(headline: string): HeadlineSegment[] {
  const segments: HeadlineSegment[] = [];
  let cursor = 0;
  for (const match of headline.matchAll(EMPHASIS_PATTERN)) {
    if (match.index > cursor)
      segments.push({
        text: headline.slice(cursor, match.index),
        isHighlighted: false,
      });
    segments.push({ text: match[1]!, isHighlighted: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < headline.length)
    segments.push({ text: headline.slice(cursor), isHighlighted: false });
  return segments;
}
