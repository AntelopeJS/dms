import { describe, expect, it } from "vitest";
import uiEn from "../layers/dms-ui/app/entries/i18n/locales/ui-en-GB.json";
import uiFr from "../layers/dms-ui/app/entries/i18n/locales/ui-fr-FR.json";

describe("the Mockups page's description", () => {
  it("says what mockups are for, in English and in French (fails when the header shows the inspector's Description label)", () => {
    expect(uiEn.dms.mockup.mockups_description).toBe(
      "Clickable drafts of your pages. Comment on them, then have the AI build them.",
    );
    expect(uiFr.dms.mockup.mockups_description).toBe(
      "Des brouillons cliquables de vos pages. Commentez-les, puis faites-les construire par l’IA.",
    );
  });
});
