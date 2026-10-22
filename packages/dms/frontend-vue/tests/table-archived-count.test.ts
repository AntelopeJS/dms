/**
 * The caption count of the archive: a default agreeing with no noun, in
 * every locale, and a table view's own label naming its rows.
 */
import { createI18n } from "vue-i18n";
import { describe, expect, it } from "vitest";
import { formatArchivedCount } from "../layers/dms-ui/app/build/composables/table/utils/archivedCount";
import en from "../layers/dms-ui/i18n/locales/ui-en-GB.json";
import fr from "../layers/dms-ui/i18n/locales/ui-fr-FR.json";

const invoices = {
  invoices: {
    archived_count: "{count} facture archivée | {count} factures archivées",
  },
};

function translator(locale: "en" | "fr") {
  const i18n = createI18n({
    legacy: false,
    locale,
    fallbackLocale: "en",
    messages: { en, fr: { ...fr, ...invoices } },
  });
  return i18n.global.t as Parameters<typeof formatArchivedCount>[0];
}

describe("formatArchivedCount", () => {
  it("counts the archive without agreeing with a noun", () => {
    expect(formatArchivedCount(translator("en"), 13, "13")).toBe("Archived: 13");
    expect(formatArchivedCount(translator("fr"), 13, "13")).toBe(
      "Archives : 13",
    );
  });

  it("keeps the formatted count", () => {
    expect(formatArchivedCount(translator("en"), 1200, "1,200")).toBe(
      "Archived: 1,200",
    );
  });

  it("names the rows with the table view's own key, pluralized", () => {
    const t = translator("fr");
    expect(formatArchivedCount(t, 13, "13", "$invoices.archived_count")).toBe(
      "13 factures archivées",
    );
    expect(formatArchivedCount(t, 1, "1", "$invoices.archived_count")).toBe(
      "1 facture archivée",
    );
  });

  it("fills a plain text label", () => {
    expect(
      formatArchivedCount(translator("en"), 3, "3", "{count} archived invoices"),
    ).toBe("3 archived invoices");
  });
});
