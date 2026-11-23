const INITIALS_LENGTH = 2;
const WORD_SPLIT = /[\s.@_-]+/;
const LETTER_OR_DIGIT = /^[\p{L}\p{N}]/u;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), ({ segment }) => segment);
}

function wordInitials(word: string, count: number): string[] {
  const characters = graphemes(word);
  const letters = characters.filter((character) =>
    LETTER_OR_DIGIT.test(character),
  );
  return letters.length > 0 ? letters.slice(0, count) : characters.slice(0, 1);
}

/**
 * The two characters an avatar draws for a name without a picture: the first
 * letter or digit of its first two words ("Camille Martin" → "CM", "3M Group" →
 * "3G"), or the first two letters or digits of a one-word name ("EduLoop" →
 * "ED"), uppercased. Words split on spaces, dots, `@`, `_` and `-`, so an
 * address reads as a name ("ada.lovelace@example.com" → "AL"). Characters are
 * whole graphemes: an accent or an emoji is never cut in half.
 */
export function labelInitials(label: string): string {
  const words = label.split(WORD_SPLIT).filter(Boolean);
  const [only] = words;
  const characters =
    words.length === 1 && only !== undefined
      ? wordInitials(only, INITIALS_LENGTH)
      : words
          .slice(0, INITIALS_LENGTH)
          .flatMap((word) => wordInitials(word, 1));
  return characters.join("").toLocaleUpperCase();
}
