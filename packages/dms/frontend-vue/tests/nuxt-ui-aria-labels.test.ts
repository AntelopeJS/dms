import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import coreEn from "../layers/dms-core/i18n/locales/core-en-GB.json";
import coreFr from "../layers/dms-core/i18n/locales/core-fr-FR.json";

// Nuxt UI hard-codes these labels in English, and its locales do not carry
// them: each use has to bind its own, translated.
const LABELLED_TAGS = {
  UBreadcrumb: "dms.a11y.breadcrumb",
  USkeleton: "dms.a11y.loading",
} as const;
const LOCALES = { "en-GB": coreEn, "fr-FR": coreFr };

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function lookup(messages: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    );
}

describe("Nuxt UI hard-coded aria-labels", () => {
  const sources = walk(join(process.cwd(), "layers"))
    .filter((path) => path.endsWith(".vue"))
    .map((path) => ({
      path: relative(process.cwd(), path),
      text: readFileSync(path, "utf8"),
    }));

  for (const [tag, key] of Object.entries(LABELLED_TAGS)) {
    it(`binds a translated aria-label on every ${tag}`, () => {
      const tagPattern = new RegExp(`<${tag}\\b[^>]*?>`, "gs");
      const offenders = sources.flatMap(({ path, text }) =>
        [...text.matchAll(tagPattern)]
          .filter(([found]) => !found.includes(`:aria-label="t('${key}')"`))
          .map(() => path),
      );

      expect(offenders).toEqual([]);
    });

    it(`translates ${key} in every locale`, () => {
      for (const messages of Object.values(LOCALES)) {
        expect(lookup(messages, key)).toBeTypeOf("string");
      }
      expect(lookup(coreFr, key)).not.toBe(lookup(coreEn, key));
    });
  }
});
