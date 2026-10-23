// A CodeMirror stream parser (a language written as a line tokenizer, like
// the shell's) run for read-only highlighting. `StreamLanguage` would do it
// inside an editor state, and so pull CodeMirror's view and state into every
// page showing a snippet: this drives the parser the same way, line by line
// over `StringStream`, and names its tokens' tags the same way.
import { type StreamParser, StringStream } from "@codemirror/streamparser";
import { type Highlighter, type Tag, tags } from "@lezer/highlight";

/** Receives one styled range of the code: its offsets and its classes. */
export type HighlightedRange = (
  from: number,
  to: number,
  classes: string,
) => void;

// CodeMirror's defaults, which `StreamLanguage` hands every stream.
const TAB_SIZE = 4;
const INDENT_UNIT = 2;
// Zero-length tokens a parser may return in a row (each one changing its
// state) before the stream moves on by itself, as `StreamLanguage` allows.
const MAX_EMPTY_TOKENS = 10;

type TagValue = Tag | readonly Tag[] | ((tag: Tag) => Tag);
const TAG_TABLE = tags as unknown as Record<string, TagValue | undefined>;
const tagsByName = new Map<string, Tag[]>();

// A token type names tags the way `StreamLanguage` reads them: space
// separated, each a tag followed by its modifiers (`variableName.special`).
function tagsOf(type: string): Tag[] {
  const cached = tagsByName.get(type);
  if (cached) return cached;
  const resolved = type.split(" ").flatMap((name) => {
    let found: Tag[] = [];
    for (const part of name.split(".")) {
      const value = TAG_TABLE[part];
      if (typeof value === "function") found = found.map(value);
      else if (value && !found.length)
        found = Array.isArray(value) ? [...value] : [value as Tag];
    }
    return found;
  });
  tagsByName.set(type, resolved);
  return resolved;
}

/**
 * Tokenizes `code` with `parser` and calls `put` for each range its
 * highlighter styles, adjacent ranges of one style merged, as
 * `highlightTree` reports a parsed tree.
 */
export function highlightStream<State>(
  parser: StreamParser<State>,
  code: string,
  highlighter: Highlighter,
  put: HighlightedRange,
): void {
  const state = parser.startState?.(INDENT_UNIT) ?? (true as State);
  let pending: { from: number; to: number; classes: string } | null = null;
  const flush = () => {
    if (pending) put(pending.from, pending.to, pending.classes);
    pending = null;
  };
  const add = (from: number, to: number, classes: string | null) => {
    if (pending && (pending.to !== from || pending.classes !== classes))
      flush();
    if (!classes) return;
    if (pending) pending.to = to;
    else pending = { from, to, classes };
  };

  let lineStart = 0;
  for (const line of code.split("\n")) {
    if (!line) parser.blankLine?.(state, INDENT_UNIT);
    const stream = new StringStream(line, TAB_SIZE, INDENT_UNIT);
    let emptyTokens = 0;
    while (!stream.eol()) {
      stream.start = stream.pos;
      const type = parser.token(stream, state);
      if (stream.pos === stream.start) {
        if (++emptyTokens < MAX_EMPTY_TOKENS) continue;
        stream.next();
      }
      emptyTokens = 0;
      const classes = type ? highlighter.style(tagsOf(type)) : null;
      add(lineStart + stream.start, lineStart + stream.pos, classes);
    }
    lineStart += line.length + 1;
  }
  flush();
}
