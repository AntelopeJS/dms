import { describe, expect, it } from "vitest";
import coreEn from "../layers/dms-core/i18n/locales/core-en-GB.json";
import coreFr from "../layers/dms-core/i18n/locales/core-fr-FR.json";

const LABELLED_TAGS = {
  UBreadcrumb: "dms.a11y.breadcrumb",
  USkeleton: "dms.a11y.loading",
} as const;
const LOCALES = { "en-GB": coreEn, "fr-FR": coreFr };

function lookup(messages: unknown, key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      messages,
    );
}

describe("Nuxt UI hard-coded aria-labels", () => {
  for (const key of Object.values(LABELLED_TAGS)) {
    it(`translates ${key} in every locale`, () => {
      for (const messages of Object.values(LOCALES)) {
        expect(lookup(messages, key)).toBeTypeOf("string");
      }
      expect(lookup(coreFr, key)).not.toBe(lookup(coreEn, key));
    });
  }
});
