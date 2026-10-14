import { expect } from "chai";
import {
  builtInEmailSubject,
  resolveEmailLanguage,
} from "../../../utils/email-subjects";

describe("[unit] utils/email-subjects", () => {
  describe("resolveEmailLanguage", () => {
    it("keeps a supported language, region dropped", () => {
      expect(resolveEmailLanguage("fr-FR")).to.equal("fr");
      expect(resolveEmailLanguage("EN-gb")).to.equal("en");
    });

    it("falls back to English", () => {
      expect(resolveEmailLanguage()).to.equal("en");
      expect(resolveEmailLanguage("de")).to.equal("en");
      expect(resolveEmailLanguage("constructor")).to.equal("en");
    });
  });

  describe("builtInEmailSubject", () => {
    it("writes the subject in the recipient's language", () => {
      expect(builtInEmailSubject("resetPassword", "fr")).to.equal(
        "Réinitialisez votre mot de passe",
      );
      expect(builtInEmailSubject("resetPassword", "en-GB")).to.equal(
        "Reset Your Password",
      );
    });

    it("writes English for a language without copy", () => {
      expect(builtInEmailSubject("exportReady", "de")).to.equal(
        "Your data export is ready",
      );
    });
  });
});
