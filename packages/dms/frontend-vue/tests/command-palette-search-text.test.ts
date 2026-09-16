import { highlight } from "@nuxt/ui/utils/search";
import { describe, expect, it } from "vitest";
import { resolveOptionalI18nKey } from "../layers/dms-core/app/composables/translation/useTranslation";
import {
  COMMAND_PALETTE_SEARCH_TEXT_KEY,
  hideSearchTextMatches,
} from "../layers/dms-layout/app/composables/useCommandPaletteSources";

const MESSAGES: Record<string, string> = {
  "settings.billing.description": "Manage your plan and invoices",
};

function translate(key: string): string {
  return MESSAGES[key] ?? key;
}

function item(matchedKeys: string[]) {
  return {
    label: "Billing",
    suffix: "Settings",
    matches: matchedKeys.map((key) => ({ key, value: "match" })),
  };
}

// Recorded from Fuse while searching "shareable" against a page whose title
// does not contain the term, so the contract test below runs on the shape the
// palette really produces. `highlight` renders the first match whose key is not
// the palette's `labelKey` (`label` by default) as the item suffix.
const SEARCH_TEXT_MATCH = {
  key: COMMAND_PALETTE_SEARCH_TEXT_KEY,
  value: "Tabs with URL persistence for shareable links",
  indices: [[30, 38]] as [number, number][],
};
const PALETTE_LABEL_KEY = "label";

describe("resolveOptionalI18nKey", () => {
  it("translates a prefixed key", () => {
    expect(
      resolveOptionalI18nKey(translate, "$settings.billing.description"),
    ).to.equal("Manage your plan and invoices");
  });

  it("returns a plain string verbatim", () => {
    expect(resolveOptionalI18nKey(translate, "Manage invoices")).to.equal(
      "Manage invoices",
    );
  });

  it("returns undefined for an untranslated key", () => {
    expect(
      resolveOptionalI18nKey(translate, "$settings.billing.missing"),
    ).to.equal(undefined);
  });

  it("returns undefined when there is nothing to resolve", () => {
    expect(resolveOptionalI18nKey(translate, undefined)).to.equal(undefined);
    expect(resolveOptionalI18nKey(translate, "")).to.equal(undefined);
  });
});

describe("hideSearchTextMatches", () => {
  it("drops search text matches so they cannot render as a suffix", () => {
    const group = hideSearchTextMatches({ id: "navigation" });
    const [filtered] = group.postFilter!("plan", [
      item([COMMAND_PALETTE_SEARCH_TEXT_KEY]),
    ]);

    expect(filtered!.matches).to.deep.equal([]);
  });

  it("keeps matches on rendered keys", () => {
    const group = hideSearchTextMatches({ id: "navigation" });
    const [filtered] = group.postFilter!("settings", [
      item(["suffix", COMMAND_PALETTE_SEARCH_TEXT_KEY]),
    ]);

    expect(filtered!.matches).to.deep.equal([
      { key: "suffix", value: "match" },
    ]);
  });

  it("keeps the hidden text out of the suffix Nuxt UI renders", () => {
    const matched = {
      label: "Persistent Tabs",
      suffix: "Pages › Layout › Tabs",
    };
    const leaked = highlight(
      { ...matched, matches: [SEARCH_TEXT_MATCH] },
      "shareable",
      undefined,
      [PALETTE_LABEL_KEY],
    );
    expect(leaked).to.contain("<mark>shareable</mark>");

    const [guarded] = hideSearchTextMatches({ id: "navigation" }).postFilter!(
      "shareable",
      [{ ...matched, matches: [SEARCH_TEXT_MATCH] }],
    );

    expect(
      highlight(guarded!, "shareable", undefined, [PALETTE_LABEL_KEY]),
    ).to.equal(undefined);
  });

  it("runs after the group's own filter", () => {
    const group = hideSearchTextMatches({
      id: "navigation",
      postFilter: (_searchTerm, items) => items.slice(1),
    });
    const filtered = group.postFilter!("plan", [
      item(["label"]),
      item([COMMAND_PALETTE_SEARCH_TEXT_KEY]),
    ]);

    expect(filtered).to.have.length(1);
    expect(filtered[0]!.matches).to.deep.equal([]);
  });
});
