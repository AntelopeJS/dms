import { describe, expect, it } from "vitest";
import {
  type CodeToken,
  highlightCode,
} from "../layers/dms-ui/app/build/utils/codeHighlight";
import { resolveCodeLanguage } from "../layers/dms-ui/app/build/utils/codeLanguages";

const KEYWORD = "var(--ui-primary)";
const STRING = "var(--ui-success)";
const NUMBER = "var(--ui-warning)";
const COMMENT = "var(--ui-text-dimmed)";
const PROPERTY = "var(--ui-info)";

const colorOf = (tokens: CodeToken[], text: string) =>
  tokens.find((token) => token.text === text)?.style?.color;

const joined = (tokens: CodeToken[]) =>
  tokens.map((token) => token.text).join("");

describe("read-only code highlighting", () => {
  it("keeps every character of the code, in order", () => {
    const code = '{\n  "name": "media",\n  "size": 42\n}';
    expect(joined(highlightCode(code, "json"))).toBe(code);
  });

  it("colours JSON keys, strings and numbers", () => {
    const tokens = highlightCode('{ "name": "media", "size": 42 }', "json");
    expect(colorOf(tokens, '"name"')).toBe(PROPERTY);
    expect(colorOf(tokens, '"media"')).toBe(STRING);
    expect(colorOf(tokens, "42")).toBe(NUMBER);
  });

  it("reads TypeScript, SQL and HTML with the editor's languages", () => {
    expect(
      colorOf(highlightCode("const x: number = 1;", "typescript"), "const"),
    ).toBe(KEYWORD);
    expect(
      colorOf(highlightCode("SELECT id FROM users", "sql"), "SELECT"),
    ).toBe(KEYWORD);
    expect(colorOf(highlightCode('<a href="/">x</a>', "html"), "a")).toBe(
      KEYWORD,
    );
  });

  it("marks a shell command, its flags, strings, variables and comments", () => {
    const code =
      'curl -X POST "$API_URL" \\\n  -H "Accept: json" # send\necho $HOME | grep root';
    const tokens = highlightCode(code, "shell");
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

  it("shows plain text and unknown languages as written", () => {
    expect(highlightCode("SELECT 1", "text")).toEqual([{ text: "SELECT 1" }]);
    expect(highlightCode("x = 1", "cobol")).toEqual([{ text: "x = 1" }]);
  });

  it("reads the usual aliases as their language", () => {
    expect(resolveCodeLanguage("bash")).toBe("shell");
    expect(resolveCodeLanguage("TS")).toBe("typescript");
    expect(resolveCodeLanguage("plain")).toBe("text");
    expect(resolveCodeLanguage(undefined)).toBe("text");
  });
});
