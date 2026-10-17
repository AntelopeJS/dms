/**
 * A form that posts creates a row: its submit reads "Create", not "Save
 * changes", and its fields carry no "Changed · was empty" note, since a new
 * row has no earlier value to compare with.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("a create form", () => {
  const form = read("../layers/dms-ui/app/components/form/Form.vue");
  const useForm = read("../layers/dms-ui/app/composables/form/useForm.ts");

  it("is a form that posts", () => {
    expect(useForm).toMatch(
      /const createsRecord = props\.submitUrlMethod === HttpMethod\.post;/,
    );
  });

  it("submits with the create wording", () => {
    expect(form).toMatch(
      /createsRecord\s*\?\s*"dms\.button\.create"\s*:\s*"dms\.button\.save_changes"/,
    );
    for (const locale of ["en-GB", "fr-FR"]) {
      const messages = JSON.parse(
        read(`../layers/dms-ui/i18n/locales/ui-${locale}.json`),
      );
      expect(messages.dms.button.create, locale).toBeTruthy();
    }
  });

  it("shows no change notes", () => {
    expect(form).toMatch(
      /showsChanges: !isInstant && !isActionForm && !createsRecord/,
    );
  });
});
