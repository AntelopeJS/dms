import { describe, expect, it } from "vitest";
import { createI18n } from "vue-i18n";
import {
  formatRecordLabel,
  resolveFormContainerTexts,
  type FormContainerTextSource,
} from "../layers/dms-ui/app/build/composables/table-view/utils/formTexts";
import en from "../layers/dms-ui/i18n/locales/ui-en-GB.json";
import fr from "../layers/dms-ui/i18n/locales/ui-fr-FR.json";

const TASKS = {
  en: {
    caption: "Tasks",
    edit_title: "Edit task",
    edit_description: "Change its status or assignees.",
  },
  fr: { caption: "Tâches" },
};

function texts(source: FormContainerTextSource, locale: "en" | "fr" = "en") {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: {
      en: { ...en, tasks: TASKS.en },
      fr: { ...fr, tasks: TASKS.fr },
    },
  });
  const t = (key: string, params?: Record<string, unknown>) =>
    i18n.global.t(key, params ?? {});
  const resolve = (text: string) =>
    text.startsWith("$") ? t(text.slice(1)) : text;
  return resolveFormContainerTexts(source, resolve, t);
}

describe("TableView form container texts", () => {
  it("uses the table's own texts and follows the title with the row label", () => {
    expect(
      texts({
        kind: "edit",
        caption: "$tasks.caption",
        formTexts: {
          edit: {
            title: "$tasks.edit_title",
            description: "$tasks.edit_description",
          },
        },
        recordLabel: "Write the docs",
      }),
    ).toEqual({
      title: "Edit task · Write the docs",
      description: "Change its status or assignees.",
    });
  });

  it("falls back to entry texts naming the caption, never an item", () => {
    const fallback = texts({ kind: "new", caption: "$tasks.caption" });
    expect(fallback).toEqual({
      title: "New entry",
      description: "Added to Tasks once saved.",
    });
    expect(JSON.stringify(fallback)).not.toMatch(/item/i);
  });

  it("speaks French in the fallback too", () => {
    expect(
      texts({ kind: "view", caption: "$tasks.caption", recordLabel: 7 }, "fr"),
    ).toEqual({
      title: "Détails de l’entrée · 7",
      description: "Une entrée de « Tâches », en lecture seule.",
    });
  });

  it("keeps the generic description when the table has no caption", () => {
    expect(texts({ kind: "edit" })).toEqual({
      title: "Edit entry",
      description: "Change its fields, then save.",
    });
  });

  it("completes a partial override with the fallback", () => {
    expect(
      texts({
        kind: "edit",
        formTexts: { edit: { title: "Edit task" } },
        caption: "Tasks",
      }),
    ).toEqual({
      title: "Edit task",
      description: "Changes are saved to Tasks.",
    });
  });
});

describe("formatRecordLabel", () => {
  it("keeps a non-empty text or a number", () => {
    expect(formatRecordLabel("  zz@example.com ")).toBe("zz@example.com");
    expect(formatRecordLabel(42)).toBe("42");
  });

  it("reads a localized value in the reader's locale, else its first text", () => {
    const name = { en: "Task 1", fr: "Tâche 1" };
    expect(formatRecordLabel(name, "fr-FR")).toBe("Tâche 1");
    expect(formatRecordLabel(name, "en")).toBe("Task 1");
    expect(formatRecordLabel({ en: "Task 1" }, "fr-FR")).toBe("Task 1");
  });

  it("drops what cannot name a row", () => {
    expect(formatRecordLabel("   ")).toBeUndefined();
    expect(formatRecordLabel(null)).toBeUndefined();
    expect(formatRecordLabel({ en: " " })).toBeUndefined();
    expect(formatRecordLabel(["Task 1"])).toBeUndefined();
  });
});
