import { getQuery, withQuery } from "ufo";
import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import {
  BULK_CONFIRM_TONES,
  bulkActionConfirm,
  bulkActionOutcome,
  bulkActionQuery,
  type PluralTranslate,
  selectedRowIds,
} from "../layers/dms-ui/app/build/composables/table-view/utils/bulkActions";
import en from "../layers/dms-ui/i18n/locales/ui-en-GB.json";
import fr from "../layers/dms-ui/i18n/locales/ui-fr-FR.json";

function translator(locale: "en" | "fr"): PluralTranslate {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: { en, fr },
  });
  return (key, named, plural) => i18n.global.t(key, named, plural);
}

const IDS = ["17", "21", "23"];

describe("TableView bulk actions", () => {
  it("maps the selection to every selected row id, other pages included", () => {
    expect(
      selectedRowIds({ "17": true, "21": true, "5": false, "23": true }),
    ).toEqual(IDS);
    expect(selectedRowIds({})).toEqual([]);
  });

  it("sends every id as one repeated query key", () => {
    const url = withQuery("/api/task/archive", bulkActionQuery("ids", IDS));
    expect(url).toBe("/api/task/archive?ids=17&ids=21&ids=23");
    expect(getQuery(url).ids).toEqual(IDS);
    // A single selected row still goes as a list.
    expect(withQuery("/api/task/delete", bulkActionQuery("id", ["17"]))).toBe(
      "/api/task/delete?id=17",
    );
  });

  it("counts what each bulk route changed and what it skipped", () => {
    expect(bulkActionOutcome({ success: true, archivedCount: 3 }, 3)).toEqual({
      processed: 3,
      skipped: 0,
    });
    expect(bulkActionOutcome({ success: true, restoredCount: 2 }, 3)).toEqual({
      processed: 2,
      skipped: 1,
    });
    // Delete answers with the number of deleted rows, or `{ deleted: 0 }`
    // when a row rule refused every id.
    expect(bulkActionOutcome(1, 3)).toEqual({ processed: 1, skipped: 2 });
    expect(bulkActionOutcome({ deleted: 0 }, 3)).toEqual({
      processed: 0,
      skipped: 3,
    });
  });

  it("takes a response without a count as a full success", () => {
    expect(bulkActionOutcome(undefined, 3)).toEqual({
      processed: 3,
      skipped: 0,
    });
    expect(bulkActionOutcome({ success: true }, 2)).toEqual({
      processed: 2,
      skipped: 0,
    });
    // A count above the request never reports negative skips.
    expect(bulkActionOutcome(5, 3)).toEqual({ processed: 3, skipped: 0 });
  });
});

describe("TableView bulk action confirmations", () => {
  it("warns before archiving and alarms before deleting", () => {
    expect(BULK_CONFIRM_TONES).toEqual({
      archive: "warning",
      delete: "error",
      deletePermanently: "error",
    });
    const t = translator("en");
    expect(bulkActionConfirm("archive", 2, t)).toMatchObject({
      confirmColor: "warning",
      icon: "i-ph-archive",
    });
    expect(bulkActionConfirm("delete", 2, t)).toMatchObject({
      confirmColor: "error",
      icon: "i-ph-trash",
    });
    expect(bulkActionConfirm("deletePermanently", 2, t)).toMatchObject({
      confirmColor: "error",
      icon: "i-ph-trash",
    });
  });

  it("counts the rows, in the singular or the plural (en-GB)", () => {
    const t = translator("en");
    expect(bulkActionConfirm("delete", 1, t)).toMatchObject({
      title: "Delete this item?",
      confirmLabel: "Delete",
    });
    expect(bulkActionConfirm("delete", 3, t)).toMatchObject({
      title: "Delete 3 items?",
      description:
        "The 3 selected items will be deleted. This action cannot be undone.",
      confirmLabel: "Delete 3 items",
    });
    expect(bulkActionConfirm("deletePermanently", 3, t).title).toBe(
      "Permanently delete 3 archived items?",
    );
    expect(bulkActionConfirm("deletePermanently", 1, t).confirmLabel).toBe(
      "Delete permanently",
    );
    expect(bulkActionConfirm("archive", 1, t).title).toBe("Archive this item?");
    expect(bulkActionConfirm("archive", 2, t).title).toBe("Archive 2 items?");
    expect(t("dms.table.archive_rows", { count: 1 }, 1)).toBe(
      "1 item archived",
    );
    expect(t("dms.table.delete_rows", { count: 3 }, 3)).toBe("3 items deleted");
    expect(t("dms.table.restore_rows", { count: 0 }, 0)).toBe(
      "0 items restored",
    );
  });

  it("counts the rows, in the singular or the plural (fr-FR)", () => {
    const t = translator("fr");
    expect(bulkActionConfirm("delete", 1, t).title).toBe(
      "Supprimer cet élément ?",
    );
    expect(bulkActionConfirm("delete", 4, t).title).toBe(
      "Supprimer 4 éléments ?",
    );
    expect(bulkActionConfirm("deletePermanently", 2, t).title).toBe(
      "Supprimer définitivement 2 éléments archivés ?",
    );
    expect(bulkActionConfirm("archive", 1, t).confirmLabel).toBe("Archiver");
    expect(t("dms.table.archive_rows", { count: 1 }, 1)).toBe(
      "1 élément archivé",
    );
    expect(t("dms.table.archive_rows", { count: 2 }, 2)).toBe(
      "2 éléments archivés",
    );
  });

  it("keeps the same keys in both locales", () => {
    const keys = (messages: typeof en) =>
      Object.keys(messages.dms.table).filter((key) =>
        /_confirm_|_rows$|row_selection_count/.test(key),
      );
    expect(keys(fr as typeof en).sort()).toEqual(keys(en).sort());
  });
});
