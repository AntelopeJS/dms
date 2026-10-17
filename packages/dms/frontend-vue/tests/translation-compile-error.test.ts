/**
 * A message vue-i18n cannot compile — a field placeholder holding a raw "@",
 * which it reads as a linked message — threw from the translation and took
 * the whole form rendering it down: its modal opened blank. One bad message
 * is shown as written instead, and reported once in development.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";
import {
  resolveI18nKey,
  tolerantTranslate,
} from "../layers/dms-core/app/composables/translation/useTranslation";

const EMAIL_PLACEHOLDER = "first.last@example.com";

function translator() {
  const i18n = createI18n({
    legacy: false,
    locale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en: {
        contact: {
          email_placeholder: EMAIL_PLACEHOLDER,
          name_label: "Name",
          greeting: "Hello {name}",
        },
      },
    },
  });
  const { t, tm } = i18n.global;
  return { t, tm };
}

afterEach(() => vi.restoreAllMocks());

describe("tolerantTranslate", () => {
  it("shows a message that does not compile as written", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { t, tm } = translator();
    expect(() => t("contact.email_placeholder")).toThrow();

    const translate = tolerantTranslate(t, tm);
    expect(resolveI18nKey(translate, "$contact.email_placeholder")).toBe(
      EMAIL_PLACEHOLDER,
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain(
      "contact.email_placeholder",
    );
  });

  it("reports a broken message once, however often it is drawn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = tolerantTranslate(() => {
      throw new SyntaxError("Message compilation error");
    });
    failing("contact.reported", {});
    failing("contact.reported", {});
    expect(
      warn.mock.calls.filter(([message]) =>
        String(message).includes("contact.reported"),
      ),
    ).toHaveLength(1);
  });

  it("falls back to the key when the message's text cannot be read", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = tolerantTranslate(() => {
      throw new SyntaxError("Message compilation error");
    });
    expect(failing("contact.unreadable", {})).toBe("contact.unreadable");
  });

  it("translates the other messages as before", () => {
    const { t, tm } = translator();
    const translate = tolerantTranslate(t, tm);
    expect(resolveI18nKey(translate, "$contact.name_label")).toBe("Name");
    expect(
      resolveI18nKey(translate, "$contact.greeting", { name: "Ann" }),
    ).toBe("Hello Ann");
    expect(resolveI18nKey(translate, "plain text")).toBe("plain text");
  });
});
