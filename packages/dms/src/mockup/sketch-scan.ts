/** The states of the HTML tokenizer a tag's attributes go through, as the HTML spec names them. */
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

/** Whether `character` is an ASCII letter, the only letters that open a tag. */
function isLetter(character: string): boolean {
  return /^[A-Za-z]$/.test(character);
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

/** Every state, in a fixed order, so a run can be kept in an array slot. */
const STATES: readonly ScanState[] = [
  "data",
  "tagOpen",
  "endTagOpen",
  "tagName",
  "beforeName",
  "name",
  "afterName",
  "beforeValue",
  "doubleQuoted",
  "singleQuoted",
  "unquoted",
  "afterQuoted",
  "selfClosing",
];
const STATE_INDEX = new Map(STATES.map((state, index) => [state, index]));
/** A state no run is in. */
const NO_RUN = -1;

function indexOf(state: ScanState): number {
  return STATE_INDEX.get(state) ?? 0;
}

/**
 * Whether a tag of `markup` may hold more than `limit` attributes, read in one
 * pass as the HTML tokenizer reads attributes. parse5 checks each attribute
 * against the ones before it, so its time on one tag grows with the square of
 * its attributes; this bounds them before it parses.
 *
 * The scan cannot know where comments, raw text or CDATA end the way the
 * parser does, so it does not try: it keeps one run per tokenizer state, and
 * always one more in the data state, so every `<` and letter starts a tag run
 * whatever the other runs read. Runs in the same state read the rest alike, so
 * they merge, keeping the higher count. The answer is an upper bound on any
 * tag parse5 reads, in time linear in `markup` (at most one run per state).
 */
export function moreAttributesThan(markup: string, limit: number): boolean {
  let runs = new Int32Array(STATES.length).fill(NO_RUN);
  let next = new Int32Array(STATES.length);
  for (let at = 0; at < markup.length; at += 1) {
    const character = markup.charAt(at);
    next.fill(NO_RUN);
    runs[indexOf("data")] = Math.max(runs[indexOf("data")] ?? NO_RUN, 0);
    for (let slot = 0; slot < STATES.length; slot += 1) {
      const count = runs[slot] ?? NO_RUN;
      const state = STATES[slot];
      if (count === NO_RUN || state === undefined) continue;
      let step = STEPS[state](character);
      if (step.again === true) step = STEPS[step.next](character);
      const opens = step.next === "tagName" && state !== "tagName";
      const counted = opens ? 0 : count + (step.starts === true ? 1 : 0);
      if (counted > limit) return true;
      const target = indexOf(step.next);
      next[target] = Math.max(next[target] ?? NO_RUN, counted);
    }
    [runs, next] = [next, runs];
  }
  return false;
}
