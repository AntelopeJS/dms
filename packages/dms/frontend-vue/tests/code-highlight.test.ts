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
import { describe, expect, it } from "vitest";
import {
  type CodeToken,
  loadCodeHighlighter,
} from "../layers/dms-ui/app/build/utils/codeHighlight";
import { resolveCodeLanguage } from "../layers/dms-ui/app/build/utils/codeLanguages";
import { CODE_PALETTE } from "../layers/dms-ui/app/build/utils/codePalette";
import { shellParser } from "../layers/dms-ui/app/build/utils/shellParser";

const KEYWORD = "var(--ui-primary)";
const STRING = "var(--ui-success)";
const NUMBER = "var(--ui-warning)";
const COMMENT = "var(--ui-text-dimmed)";
const PROPERTY = "var(--ui-info)";

const colorOf = (tokens: CodeToken[], text: string) =>
  tokens.find((token) => token.text === text)?.style?.color;

const joined = (tokens: CodeToken[]) =>
  tokens.map((token) => token.text).join("");

const highlight = async (code: string, language: string) =>
  (await loadCodeHighlighter(language))(code);

const EDITOR_PARSERS: Record<string, Parser> = {
  json: jsonLanguage.parser,
  javascript: javascriptLanguage.parser,
  typescript: typescriptLanguage.parser,
  html: htmlLanguage.parser,
  sql: StandardSQL.language.parser,
  shell: StreamLanguage.define(shellParser).parser,
};

const PALETTE_HIGHLIGHTER = tagHighlighter(
  CODE_PALETTE.map((entry, index) => ({ tag: entry.tag, class: `${index}` })),
);

function editorTokens(code: string, language: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let cursor = 0;
  highlightTree(
    EDITOR_PARSERS[language].parse(code),
    PALETTE_HIGHLIGHTER,
    (from, to, classes) => {
      if (from > cursor) tokens.push({ text: code.slice(cursor, from) });
      const { color, fontStyle } = CODE_PALETTE[Number(classes.split(" ")[0])];
      tokens.push({ text: code.slice(from, to), style: { color, fontStyle } });
      cursor = to;
    },
  );
  if (cursor < code.length) tokens.push({ text: code.slice(cursor) });
  return tokens;
}

const SAMPLES: Record<string, string> = {
  json: '{\n  "name": "media",\n  "size": 42,\n  "tags": ["a", null, true],\n  "nested": { "ratio": -1.5e3 }\n}',
  javascript: [
    "// load the rows",
    "import { list } from './api.js';",
    "export async function rows(limit = 10) {",
    "  const found = await list({ limit, sort: /name/i });",
    "  return found.map((row) => `${row.id}: ${row.name}`); /* done */",
    "}",
  ].join("\n"),
  typescript: [
    "interface Row<T> { id: string; value?: T }",
    "@Controller()",
    "export class Rows implements Source {",
    "  private readonly cache = new Map<string, Row<number>>();",
    "  get(id: string): Row<number> | undefined { return this.cache.get(id) as Row<number>; }",
    "}",
    "type Mode = 'a' | 'b';",
    "enum Level { Low = 1, High = 2 }",
  ].join("\n"),
  html: [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<!-- the head -->",
    "<head>",
    "  <style>body { color: red; margin: 0 }</style>",
    '  <script type="module">import { a } from "./a.js"; const b = 1;</script>',
    '  <script lang="ts">const id: string = "x";</script>',
    '  <script type="application/json">{ "on": true, "n": 3 }</script>',
    '  <script type="text/jsx">const view = <div id="x">hi</div>;</script>',
    '  <script type="text/plain">not code</script>',
    "</head>",
    '<body style="background: blue; padding: 4px" onclick="go(1, \'x\')">',
    '  <a href="/docs" class="link">Docs &amp; more</a>',
    "  <input disabled>",
    "</body>",
    "</html>",
  ].join("\n"),
  sql: "SELECT id, count(*) AS n FROM users -- all\nWHERE name = 'x' AND age > 18\nGROUP BY id;",
  shell: [
    'curl -X POST "$API_URL" \\',
    "  -H 'Accept: json' --data @body.json # send",
    "",
    "echo ${HOME} | grep -v root && ls -la; export X=1",
  ].join("\n"),
};

describe("read-only code highlighting", () => {
  it("keeps every character of the code, in order", async () => {
    const code = '{\n  "name": "media",\n  "size": 42\n}';
    expect(joined(await highlight(code, "json"))).toBe(code);
  });

  it.each(Object.keys(SAMPLES))(
    "colours %s exactly like the editor's language",
    async (language) => {
      const code = SAMPLES[language];
      const tokens = await highlight(code, language);
      expect(joined(tokens)).toBe(code);
      expect(tokens).toEqual(editorTokens(code, language));
    },
  );

  it("colours JSON keys, strings and numbers", async () => {
    const tokens = await highlight('{ "name": "media", "size": 42 }', "json");
    expect(colorOf(tokens, '"name"')).toBe(PROPERTY);
    expect(colorOf(tokens, '"media"')).toBe(STRING);
    expect(colorOf(tokens, "42")).toBe(NUMBER);
  });

  it("reads TypeScript, SQL and HTML with the editor's languages", async () => {
    expect(
      colorOf(await highlight("const x: number = 1;", "typescript"), "const"),
    ).toBe(KEYWORD);
    expect(
      colorOf(await highlight("SELECT id FROM users", "sql"), "SELECT"),
    ).toBe(KEYWORD);
    expect(colorOf(await highlight('<a href="/">x</a>', "html"), "a")).toBe(
      KEYWORD,
    );
  });

  it("reads the scripts, styles and handlers nested in HTML in their languages", async () => {
    const tokens = await highlight(SAMPLES.html, "html");

    expect(colorOf(tokens, "import")).toBe(KEYWORD);
    expect(colorOf(tokens, '"./a.js"')).toBe(STRING);
    expect(colorOf(tokens, '"x"')).toBe(STRING);

    expect(colorOf(tokens, '"on"')).toBe(STRING);
    expect(colorOf(tokens, "3")).toBe(NUMBER);

    expect(colorOf(tokens, "color")).toBe(PROPERTY);
    expect(colorOf(tokens, "background")).toBe(PROPERTY);
    expect(colorOf(tokens, "4")).toBe(NUMBER);
    expect(colorOf(tokens, "go")).toBe(KEYWORD);

    expect(colorOf(tokens, "'x'")).toBe(STRING);

    expect(colorOf(tokens, "not code")).toBeUndefined();
    expect(colorOf(tokens, "<!-- the head -->")).toBe(COMMENT);
  });

  it("marks a shell command, its flags, strings, variables and comments", async () => {
    const code =
      'curl -X POST "$API_URL" \\\n  -H "Accept: json" # send\necho $HOME | grep root';
    const tokens = await highlight(code, "shell");
    expect(joined(tokens)).toBe(code);
    expect(colorOf(tokens, "curl")).toBe(KEYWORD);
    expect(colorOf(tokens, "-X")).toBe(PROPERTY);
    expect(colorOf(tokens, '"$API_URL"')).toBe(STRING);
    expect(colorOf(tokens, "-H")).toBe(PROPERTY);
    expect(colorOf(tokens, "# send")).toBe(COMMENT);
    expect(colorOf(tokens, "echo")).toBe(KEYWORD);
    expect(colorOf(tokens, "$HOME")).toBe(NUMBER);
    expect(colorOf(tokens, "grep")).toBe(KEYWORD);
    expect(colorOf(tokens, "root")).toBeUndefined();
  });

  it("shows plain text, empty code and unknown languages as written", async () => {
    expect(await highlight("SELECT 1", "text")).toEqual([{ text: "SELECT 1" }]);
    expect(await highlight("x = 1", "cobol")).toEqual([{ text: "x = 1" }]);
    expect(await highlight("", "json")).toEqual([{ text: "" }]);
  });

  it("reads the usual aliases as their language", () => {
    expect(resolveCodeLanguage("bash")).toBe("shell");
    expect(resolveCodeLanguage("TS")).toBe("typescript");
    expect(resolveCodeLanguage("plain")).toBe("text");
    expect(resolveCodeLanguage(undefined)).toBe("text");
  });
});
