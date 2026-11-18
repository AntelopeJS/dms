import { describe, expect, it } from "vitest";
import { z } from "zod";

/** Every locale file of every layer, as written, by its path. */
const LOCALE_TEXTS = import.meta.glob<string>(
  "../layers/*/i18n/locales/*.json",
  { query: "?raw", import: "default", eager: true },
);
const localeFiles = () =>
  Object.entries(LOCALE_TEXTS).map(([file, text]) => ({
    file: file.replace("../layers/", ""),
    text,
  }));

/** The end of the JSON string that opens at `start`, past its closing quote. */
function stringEnd(text: string, start: number): number {
  let index = start + 1;
  while (text[index] !== '"') index += text[index] === "\\" ? 2 : 1;
  return index + 1;
}

/**
 * The keys written twice in one object of the JSON document `text`, each as
 * the dotted path of its object then the key. `JSON.parse` keeps the last
 * one and says nothing, so a key two features claim shows only one text.
 */
function duplicateKeys(text: string): string[] {
  const duplicates: string[] = [];
  const objects: Array<{ path: string; keys: Set<string> }> = [];
  let lastKey = "";
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      const end = stringEnd(text, index);
      const value = z.string().parse(JSON.parse(text.slice(index, end)));
      const isKey = /^\s*:/.test(text.slice(end));
      const current = objects.at(-1);
      if (isKey && current) {
        if (current.keys.has(value)) duplicates.push(`${current.path}${value}`);
        current.keys.add(value);
        lastKey = value;
      }
      index = end;
      continue;
    }
    if (char === "{") {
      const parent = objects.at(-1);
      objects.push({
        path: parent ? `${parent.path}${lastKey}.` : "",
        keys: new Set(),
      });
    } else if (char === "}") {
      objects.pop();
    }
    index += 1;
  }
  return duplicates;
}

describe("locale files", () => {
  it("finds the locale files of the layers", () => {
    expect(localeFiles().map(({ file }) => file)).toContain(
      "dms-ui/i18n/locales/ui-en-GB.json",
    );
  });

  it("tells a key written twice in one object (fails when the scanner misses the duplicate JSON.parse hides)", () => {
    expect(
      duplicateKeys('{"dms":{"a":"x","b":{"a":"y"},"a":"z"},"c":["a"]}'),
    ).toEqual(["dms.a"]);
  });

  it.each(localeFiles())(
    "$file holds each key once (fails when two features claim one key and the last one's text shows for both)",
    ({ text }) => {
      expect(duplicateKeys(text)).toEqual([]);
    },
  );
});
