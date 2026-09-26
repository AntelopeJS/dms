import { expect } from "chai";
import {
  buildAdminInviteSignupLink,
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

  describe("buildAdminInviteSignupLink", () => {
    const BASE_URL = "https://app.local";

    it("carries the token, the address and the invitation's language", () => {
      const link = new URL(
        buildAdminInviteSignupLink(BASE_URL, {
          email: "ada+team@acme.dev",
          token: "t0ken",
          inviteeName: "Ada Lovelace",
          language: "fr",
        }),
      );
      expect(link.origin + link.pathname).to.equal(`${BASE_URL}/auth/signup`);
      expect(Object.fromEntries(link.searchParams)).to.deep.equal({
        token: "t0ken",
        email: "ada+team@acme.dev",
        name: "Ada Lovelace",
        lang: "fr",
      });
    });

    it("leaves out the name and the language when unknown", () => {
      const link = new URL(
        buildAdminInviteSignupLink(BASE_URL, {
          email: "ada@acme.dev",
          token: "t0ken",
        }),
      );
      expect([...link.searchParams.keys()]).to.deep.equal(["token", "email"]);
    });
  });
});
