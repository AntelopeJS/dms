import { expect } from "chai";
import {
  buildAdminInviteSubject,
  resolveAdminInviteLanguage,
} from "../../../utils/admin-invite-email";

describe("[unit] utils/admin-invite-email", () => {
  describe("resolveAdminInviteLanguage", () => {
    it("keeps a supported language, regional variants included", () => {
      expect(resolveAdminInviteLanguage("fr")).to.equal("fr");
      expect(resolveAdminInviteLanguage("fr-FR")).to.equal("fr");
      expect(resolveAdminInviteLanguage("en-GB")).to.equal("en");
    });

    it("falls back to English for a missing or unsupported language", () => {
      expect(resolveAdminInviteLanguage()).to.equal("en");
      expect(resolveAdminInviteLanguage("de")).to.equal("en");
      expect(resolveAdminInviteLanguage("constructor")).to.equal("en");
    });
  });

  describe("buildAdminInviteSubject", () => {
    it("keeps the generic subject without any name", () => {
      expect(buildAdminInviteSubject({})).to.equal("You're Invited to Join");
      expect(buildAdminInviteSubject({ inviterName: "Ada" })).to.equal(
        "You're Invited to Join",
      );
    });

    it("names the platform alone", () => {
      expect(buildAdminInviteSubject({ platformName: "Acme" })).to.equal(
        "You're invited to join Acme",
      );
    });

    it("names the workspace, the platform and the inviter", () => {
      expect(
        buildAdminInviteSubject({
          workspaceName: "Storefront",
          platformName: "Acme",
          inviterName: "Ada",
        }),
      ).to.equal("Ada invited you to join Storefront on Acme");
      expect(buildAdminInviteSubject({ workspaceName: "Storefront" })).to.equal(
        "You're invited to join Storefront",
      );
    });

    it("writes the subject in French", () => {
      expect(buildAdminInviteSubject({}, "fr")).to.equal(
        "Vous êtes invité à nous rejoindre",
      );
      expect(
        buildAdminInviteSubject(
          {
            workspaceName: "Storefront",
            platformName: "Acme",
            inviterName: "Ada",
          },
          "fr-FR",
        ),
      ).to.equal("Ada vous invite à rejoindre Storefront sur Acme");
    });
  });
});
