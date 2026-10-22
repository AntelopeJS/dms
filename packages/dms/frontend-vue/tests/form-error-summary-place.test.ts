/**
 * The error summary of a refused submit keeps its place until the form is
 * saved: the last fix turns it into "no field to fix" rather than removing
 * it, so the fields and the submit button do not move up under the pointer
 * on its way to Save, and the click lands where it was aimed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "../layers/dms-ui/i18n/locales/ui-en-GB.json";
import fr from "../layers/dms-ui/i18n/locales/ui-fr-FR.json";

const read = (path: string) =>
  readFileSync(
    new URL(`../layers/dms-ui/app/${path}`, import.meta.url),
    "utf8",
  );

const form = read("components/form/Form.vue");
const summary = read("build/components/form/FormErrorSummary.vue");

describe("the form's error summary", () => {
  it("shows from a refused submit until the form is saved", () => {
    expect(form).toMatch(/<DmsFormErrorSummary\s+v-if="showsErrorSummary"/);
    expect(form).not.toMatch(/watch\(invalidFields/);
    const markClean = /function markFormClean\(\): void \{[\s\S]*?\n\}/.exec(
      form,
    )?.[0];
    expect(markClean).toContain("showsErrorSummary.value = false;");
  });

  it("says every field is fixed in place, on a line of its own", () => {
    expect(summary).toContain(
      "const isResolved = computed(() => props.items.length === 0);",
    );
    expect(summary).toContain(":color=\"isResolved ? 'success' : 'error'\"");
    expect(summary).toMatch(
      /<p v-if="isResolved"[^>]*>\s*\{\{ t\("dms\.form\.error_summary\.resolved"\) \}\}/,
    );
    expect(en.dms.form.error_summary.resolved).toBeTruthy();
    expect(fr.dms.form.error_summary.resolved).toBeTruthy();
  });
});
