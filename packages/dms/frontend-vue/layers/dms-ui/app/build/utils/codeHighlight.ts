// Read-only highlighting: the code parsed by the grammars the editor's
// CodeMirror languages are built on, and cut into styled tokens, without
// mounting an editor. Each language's grammar loads on demand and alone: a
// snippet needs neither the editor's view nor its state, which would triple
// what a page showing a JSON payload downloads. SQL is the exception: its
// grammar only ships inside `@codemirror/lang-sql`.
import type { Parser } from "@lezer/common";
import {
  type Highlighter,
  highlightTree,
  tagHighlighter,
} from "@lezer/highlight";
import { CODE_PALETTE, type CodeTokenStyle } from "./codePalette";
import type { HighlightedRange } from "./streamHighlight";

/** A run of code drawn in one style; unstyled text has no `style`. */
export interface CodeToken {
  text: string;
  style?: CodeTokenStyle;
}

/** Cuts code of the language it was loaded for into tokens. */
export type CodeHighlighter = (code: string) => CodeToken[];

/** Calls `put` for each styled range of `code`, in order. */
type RangeReader = (
  code: string,
  highlighter: Highlighter,
  put: HighlightedRange,
) => void;

const readWith =
  (parser: Parser): RangeReader =>
  (code, highlighter, put) =>
    highlightTree(parser.parse(code), highlighter, put);

// One dynamic import per language, so a page loads the grammar it shows.
const READERS: Record<string, () => Promise<RangeReader>> = {
  json: async () => readWith((await import("@lezer/json")).parser),
  javascript: async () => readWith((await import("@lezer/javascript")).parser),
  typescript: async () =>
    readWith(
      (await import("@lezer/javascript")).parser.configure({ dialect: "ts" }),
    ),
  html: async () => readWith((await import("./htmlGrammar")).htmlParser),
  sql: async () =>
    readWith(
      (await import("@codemirror/lang-sql")).StandardSQL.language.parser,
    ),
  shell: async () => {
    const [{ highlightStream }, { shellParser }] = await Promise.all([
      import("./streamHighlight"),
      import("./shellParser"),
    ]);
    return (code, highlighter, put) =>
      highlightStream(shellParser, code, highlighter, put);
  },
};

// Each palette entry's position is its class, read back into its style.
const HIGHLIGHTER = tagHighlighter(
  CODE_PALETTE.map((entry, index) => ({ tag: entry.tag, class: `${index}` })),
);

function styleOf(classes: string): CodeTokenStyle {
  const { color, fontStyle } = CODE_PALETTE[Number(classes.split(" ")[0])];
  return { color, fontStyle };
}

function tokensOf(code: string, read: RangeReader): CodeToken[] {
  if (!code) return [{ text: code }];
  const tokens: CodeToken[] = [];
  let cursor = 0;
  read(code, HIGHLIGHTER, (from, to, classes) => {
    if (from > cursor) tokens.push({ text: code.slice(cursor, from) });
    tokens.push({ text: code.slice(from, to), style: styleOf(classes) });
    cursor = to;
  });
  if (cursor < code.length) tokens.push({ text: code.slice(cursor) });
  return tokens;
}

const plain: CodeHighlighter = (code) => [{ text: code }];

/**
 * Loads the grammar of `language` (a resolved name, see
 * `resolveCodeLanguage`) and resolves to what cuts its code into styled
 * tokens; a language without a grammar shows each code as one plain token.
 */
export async function loadCodeHighlighter(
  language: string,
): Promise<CodeHighlighter> {
  const load = READERS[language];
  if (!load) return plain;
  const read = await load();
  return (code) => tokensOf(code, read);
}
