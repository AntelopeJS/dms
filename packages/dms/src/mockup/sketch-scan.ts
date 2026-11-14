/**
 * The states of the HTML tokenizer a tag's attributes go through, as the HTML
 * spec names them. Comments and bogus comments are skipped by the scan, not
 * stepped through.
 */
type ScanState =
  | "data"
  | "tagOpen"
  | "endTagOpen"
  | "tagName"
  | "beforeName"
  | "name"
  | "afterName"
  | "beforeValue"
  | "doubleQuoted"
  | "singleQuoted"
  | "unquoted"
  | "afterQuoted"
  | "selfClosing";

/** Where one character takes the tokenizer: its next state, whether it starts an attribute, and whether that state reads the same character again. */
interface Step {
  next: ScanState;
  starts?: boolean;
  again?: boolean;
}

/** HTML's whitespace, once its newlines are normalized: tab, line feed, form feed and space, carriage return included before normalization. */
function isSpace(character: string): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\f" ||
    character === "\r"
  );
}

function isLetter(character: string): boolean {
  const lower = character.toLowerCase();
  return lower >= "a" && lower <= "z" && lower.length === 1;
}

const STEPS: Record<ScanState, (character: string) => Step> = {
  data: (character) => ({ next: character === "<" ? "tagOpen" : "data" }),
  tagOpen: (character) => {
    if (isLetter(character)) return { next: "tagName" };
    if (character === "/") return { next: "endTagOpen" };
    return { next: character === "<" ? "tagOpen" : "data" };
  },
  endTagOpen: (character) => ({
    next: isLetter(character) ? "tagName" : "data",
  }),
  tagName: (character) => {
    if (isSpace(character)) return { next: "beforeName" };
    if (character === "/") return { next: "selfClosing" };
    return { next: character === ">" ? "data" : "tagName" };
  },
  beforeName: (character) => {
    if (isSpace(character)) return { next: "beforeName" };
    if (character === "/" || character === ">")
      return { next: "afterName", again: true };
    return { next: "name", starts: true };
  },
  name: (character) => {
    if (isSpace(character) || character === "/" || character === ">") {
      return { next: "afterName", again: true };
    }
    return { next: character === "=" ? "beforeValue" : "name" };
  },
  afterName: (character) => {
    if (isSpace(character)) return { next: "afterName" };
    if (character === "/") return { next: "selfClosing" };
    if (character === "=") return { next: "beforeValue" };
    if (character === ">") return { next: "data" };
    return { next: "name", starts: true };
  },
  beforeValue: (character) => {
    if (isSpace(character)) return { next: "beforeValue" };
    if (character === '"') return { next: "doubleQuoted" };
    if (character === "'") return { next: "singleQuoted" };
    if (character === ">") return { next: "data" };
    return { next: "unquoted" };
  },
  doubleQuoted: (character) => ({
    next: character === '"' ? "afterQuoted" : "doubleQuoted",
  }),
  singleQuoted: (character) => ({
    next: character === "'" ? "afterQuoted" : "singleQuoted",
  }),
  unquoted: (character) => {
    if (isSpace(character)) return { next: "beforeName" };
    return { next: character === ">" ? "data" : "unquoted" };
  },
  afterQuoted: (character) => {
    if (isSpace(character)) return { next: "beforeName" };
    if (character === "/") return { next: "selfClosing" };
    if (character === ">") return { next: "data" };
    return { next: "beforeName", again: true };
  },
  selfClosing: (character) =>
    character === ">" ? { next: "data" } : { next: "beforeName", again: true },
};

/** Where a comment or bogus comment that opens at `at` (`<!` or `<?`) ends, or -1 when it runs to the end. */
function commentEnd(markup: string, at: number): number {
  if (markup.startsWith("<!--", at)) {
    if (markup.startsWith("<!-->", at)) return at + 4;
    if (markup.startsWith("<!--->", at)) return at + 5;
    const close = markup.indexOf("-->", at + 4);
    return close === -1 ? -1 : close + 2;
  }
  return markup.indexOf(">", at);
}

/**
 * Whether a tag of `markup` holds more than `limit` attributes, read as the
 * HTML tokenizer reads attributes, in one pass. parse5 checks each attribute
 * against the ones before it, so its time on one tag grows with the square of
 * its attributes; this bounds them before it parses. Text that the parser
 * reads as raw text, such as a `<textarea>`'s, is scanned as markup, which can
 * only count more attributes than the parser finds.
 */
export function moreAttributesThan(markup: string, limit: number): boolean {
  let state: ScanState = "data";
  let attributes = 0;
  for (let at = 0; at < markup.length; at += 1) {
    const character = markup.charAt(at);
    if (state === "tagOpen" && (character === "!" || character === "?")) {
      const end = commentEnd(markup, at - 1);
      if (end === -1) return false;
      at = end;
      state = "data";
      continue;
    }
    let step = STEPS[state](character);
    if (step.again === true) step = STEPS[step.next](character);
    if (state !== "tagName" && step.next === "tagName") attributes = 0;
    if (step.starts === true) attributes += 1;
    if (attributes > limit) return true;
    state = step.next;
  }
  return false;
}
