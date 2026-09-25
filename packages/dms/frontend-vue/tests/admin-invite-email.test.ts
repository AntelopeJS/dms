import { describe, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createI18n } from "vue-i18n";
import AdminInvite from "../layers/dms-layout/app/emails/EmailAdminInvite.vue";
import en from "../layers/dms-layout/i18n/locales/layout-en-GB.json";
import fr from "../layers/dms-layout/i18n/locales/layout-fr-FR.json";

const EMAIL_ELEMENTS = ["EHtml", "EHead", "EBody", "EContainer", "ESection"];
const LEAF_ELEMENTS = ["EText", "EHeading", "EButton"];

function passthrough(tag: string) {
  return defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h(tag, slots.default?.()),
  });
}

async function renderInvite(
  props: Record<string, unknown>,
  locale = "en",
): Promise<string> {
  vi.stubGlobal("useDmsAppConfig", () => ({}));
  vi.stubGlobal("useDmsRuntimeConfig", () => ({ public: {} }));
  const app = createSSRApp(AdminInvite, {
    email: "invitee@local.test",
    signupLink: "https://app.local/auth/signup?token=t",
    expiresInDays: 7,
    ...props,
  });
  app.use(
    createI18n({
      legacy: false,
      locale,
      fallbackLocale: "en",
      messages: { en, fr },
    }),
  );
  EMAIL_ELEMENTS.forEach((name) => app.component(name, passthrough("div")));
  LEAF_ELEMENTS.forEach((name) => app.component(name, passthrough("p")));
  app.component("EImg", passthrough("img"));
  app.component("EHr", passthrough("hr"));
  const html = await renderToString(app);
  vi.unstubAllGlobals();
  return html.replace(/<!--[^>]*-->/g, "").replace(/&#39;/g, "'");
}

describe("EmailAdminInvite", () => {
  it("keeps today's generic wording without any name", async () => {
    const html = await renderInvite({});
    expect(html).toContain("You're Invited!");
    expect(html).toContain(
      "You've been invited to join our platform. Click the button below to create your account:",
    );
    expect(html).toContain("This invitation expires in 7 days.");
  });

  it("names the workspace, the platform and the inviter", async () => {
    const html = await renderInvite({
      workspaceName: "Storefront",
      platformName: "Acme",
      inviterName: "Ada",
    });
    expect(html).toContain("You're invited to Storefront");
    expect(html).toContain("Ada invited you to join Storefront on Acme.");
  });

  it("names the platform when the workspace is unknown", async () => {
    const html = await renderInvite({ platformName: "Acme" });
    expect(html).toContain("You've been invited to join Acme.");
  });

  it("writes the email in French", async () => {
    const html = await renderInvite(
      { workspaceName: "Storefront", platformName: "Acme" },
      "fr",
    );
    expect(html).toContain("Vous êtes invité à rejoindre Storefront");
    expect(html).toContain(
      "Vous avez été invité à rejoindre Storefront sur Acme.",
    );
    expect(html).toContain("Cette invitation expire dans 7 jours.");
  });
});
