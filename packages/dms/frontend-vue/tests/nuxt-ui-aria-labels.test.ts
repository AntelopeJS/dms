import { describe, expect, it } from "vitest";
import coreEn from "../layers/dms-core/i18n/locales/core-en-GB.json";
import coreFr from "../layers/dms-core/i18n/locales/core-fr-FR.json";

const LABELLED_TAGS = {
  UBreadcrumb: "breadcrumb",
  USkeleton: "loading",
} as const;
const LOCALES = { "en-GB": coreEn, "fr-FR": coreFr };

describe("Nuxt UI hard-coded aria-labels", () => {
  for (const key of Object.values(LABELLED_TAGS)) {
    it(`translates dms.a11y.${key} in every locale`, () => {
      for (const messages of Object.values(LOCALES)) {
        expect(messages.dms.a11y[key]).toBeTypeOf("string");
      }
      expect(coreFr.dms.a11y[key]).not.toBe(coreEn.dms.a11y[key]);
    });
  }
});
