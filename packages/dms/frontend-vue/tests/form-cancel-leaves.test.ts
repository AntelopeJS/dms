/**
 * Cancel drops the changes and leaves. A form page reached from another page
 * of the app (a custom edit page opened from its list, with no `backTo`)
 * offers it too, and goes back there; a page opened from outside the app
 * goes to its `backTo`, never back out of the app. Discard, which stays,
 * reads differently from Cancel in French.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fr from "../layers/dms-ui/i18n/locales/ui-fr-FR.json";

const form = readFileSync(
  new URL("../layers/dms-ui/app/components/form/Form.vue", import.meta.url),
  "utf8",
);

describe("a form's Cancel", () => {
  it("is offered on a page reached from another page of the app", () => {
    expect(form).toMatch(
      /const canCancel = computed\(\s*\(\) =>\s*inFormContainer \|\|\s*!!container \|\|\s*!!props\.backTo \|\|\s*cameFromAppPage\.value,/,
    );
    expect(form).toContain("cameFromAppPage.value = !!previousAppPage();");
  });

  it("goes back to that page, else to `backTo`", () => {
    const cancel = /function cancelForm\(\): void \{[\s\S]*?\n\}/.exec(
      form,
    )?.[0];
    expect(cancel).toMatch(
      /if \(previousAppPage\(\)\) \{\s*router\.back\(\);\s*return;\s*\}\s*if \(props\.backTo\)/,
    );
    expect(cancel).not.toContain("history.length");
  });

  it("reads the router's record of the previous page", () => {
    expect(form).toContain(
      "const back = (window.history.state as { back?: unknown } | null)?.back;",
    );
  });

  it("is not mistaken for Discard in French", () => {
    expect(fr.dms.save_bar.discard).not.toBe(fr.dms.button.cancel);
  });
});
