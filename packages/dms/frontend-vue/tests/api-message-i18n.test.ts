import { describe, expect, it } from "vitest";
import { resolveApiMessage } from "../layers/dms-core/app/composables/translation/useTranslation";

const MESSAGES: Record<string, string> = {
  "error.unauthorized": "You are not allowed to perform this action.",
  "page.settings.invites.error.not_found": "This invitation no longer exists.",
};

const translate = (key: string) => MESSAGES[key] ?? key;

describe("resolveApiMessage", () => {
  it("translates a bare backend key", () => {
    expect(resolveApiMessage(translate, "error.unauthorized")).toBe(
      "You are not allowed to perform this action.",
    );
  });

  it("translates a key carrying the DMS $ prefix", () => {
    expect(
      resolveApiMessage(translate, "$page.settings.invites.error.not_found"),
    ).toBe("This invitation no longer exists.");
  });

  it("falls back to the bare key when a $ marked key has no translation", () => {
    expect(resolveApiMessage(translate, "$error.does_not_exist")).toBe(
      "error.does_not_exist",
    );
  });

  it("returns an untranslated bare key as it came in", () => {
    expect(resolveApiMessage(translate, "error.does_not_exist")).toBe(
      "error.does_not_exist",
    );
  });

  it("leaves a plain-text message untouched", () => {
    expect(resolveApiMessage(translate, "Export response has no body")).toBe(
      "Export response has no body",
    );
  });

  it("stringifies a non-string message instead of throwing", () => {
    expect(resolveApiMessage(translate, { code: 12 })).toBe("[object Object]");
    expect(resolveApiMessage(translate, undefined)).toBe("undefined");
  });
});
