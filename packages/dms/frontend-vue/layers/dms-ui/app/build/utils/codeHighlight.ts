// Read-only highlighting: the code parsed by the editor's own CodeMirror
// languages and cut into styled tokens, without mounting an editor. Loaded on
// demand, like the editor: a page only pays for the parsers once it shows
// code.
import { htmlLanguage } from "@codemirror/lang-html";
import {
  javascriptLanguage,
  typescriptLanguage,
} from "@codemirror/lang-javascript";
import { jsonLanguage } from "@codemirror/lang-json";
import { StandardSQL } from "@codemirror/lang-sql";
import { StreamLanguage } from "@codemirror/language";
import type { Parser } from "@lezer/common";
import { highlightTree, tagHighlighter } from "@lezer/highlight";
import { CODE_PALETTE, type CodeTokenStyle } from "./codePalette";
import { shellParser } from "./shellParser";

/** A run of code drawn in one style; unstyled text has no `style`. */
export interface CodeToken {
  text: string;
  style?: CodeTokenStyle;
}

const PARSERS: Record<string, Parser> = {
  json: jsonLanguage.parser,
  javascript: javascriptLanguage.parser,
  typescript: typescriptLanguage.parser,
  html: htmlLanguage.parser,
  sql: StandardSQL.language.parser,
  shell: StreamLanguage.define(shellParser).parser,
};

// Each palette entry's position is its class, read back into its style.
const HIGHLIGHTER = tagHighlighter(
  CODE_PALETTE.map((entry, index) => ({ tag: entry.tag, class: `${index}` })),
);

function styleOf(classes: string): CodeTokenStyle {
  const { color, fontStyle } = CODE_PALETTE[Number(classes.split(" ")[0])];
  return { color, fontStyle };
}

/**
 * Cuts `code` into tokens styled for `language` (a resolved name, see
 * `resolveCodeLanguage`); a language without a parser is one plain token.
 */
export function highlightCode(code: string, language: string): CodeToken[] {
  const parser = PARSERS[language];
  if (!parser || !code) return [{ text: code }];
  const tokens: CodeToken[] = [];
  let cursor = 0;
  highlightTree(parser.parse(code), HIGHLIGHTER, (from, to, classes) => {
    if (from > cursor) tokens.push({ text: code.slice(cursor, from) });
    tokens.push({ text: code.slice(from, to), style: styleOf(classes) });
    cursor = to;
  });
  if (cursor < code.length) tokens.push({ text: code.slice(cursor) });
  return tokens;
}
