import { describe, expect, it, vi } from "vitest";
import { type Component, createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createI18n } from "vue-i18n";
import en from "../layers/dms-layout/i18n/locales/layout-en-GB.json";
import fr from "../layers/dms-layout/i18n/locales/layout-fr-FR.json";
import type { DmsBrandingLogo } from "../layers/dms-core/shared/types/app-config";

interface EmailModule {
  default: Component;
}

const emailModules = import.meta.glob<EmailModule>(
  "../layers/dms-layout/app/emails/*.vue",
  { eager: true },
);

const PUBLIC_BASE = "https://admin.example.com";
const PUBLIC_PNG_LOGO = "/images/logo.png";
const SVG_LOGO = "/images/logo.svg";
const EMAIL_LOGOS: Partial<DmsBrandingLogo> = {
  default: { light: SVG_LOGO, dark: SVG_LOGO },
  email: { light: "/branding/email.png", dark: "/branding/email-dark.png" },
};
const ELEMENTS: Record<string, string> = {
  EHtml: "html",
  EHead: "head",
  EBody: "body",
  EContainer: "div",
  ESection: "section",
  EHeading: "h1",
  EText: "p",
  EButton: "a",
  EImg: "img",
  EHr: "hr",
  EPreview: "span",
};

function element(tag: string) {
  return defineComponent({
    inheritAttrs: false,
    setup:
      (_, { attrs, slots }) =>
      () =>
        h(tag, { src: attrs.src }, slots.default?.()),
  });
}

/** A path stands for `branding.logo.default.light`. */
function brandingLogo(logo: string | Partial<DmsBrandingLogo>) {
  return typeof logo === "string" ? { default: { light: logo } } : logo;
}

function templateName(path: string): string {
  return path.split("/").pop()?.replace(".vue", "") ?? path;
}

const EMAIL_PROPS = {
  userName: "Ada",
  newEmail: "ada@new.test",
  expiresIn: "24 hours",
  expiresInHours: 24,
  partial: true,
  failedSources: ["media"],
};

async function renderEmail(
  component: Component,
  logo: string | Partial<DmsBrandingLogo>,
  locale = "en",
): Promise<string> {
  vi.stubGlobal("useDmsAppConfig", () => ({
    branding: { logo: brandingLogo(logo) },
  }));
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { clientBaseUrl: PUBLIC_BASE } },
  }));
  const app = createSSRApp(component, EMAIL_PROPS);
  app.use(
    createI18n({
      legacy: false,
      locale,
      fallbackLocale: "en",
      messages: { en, fr },
    }),
  );
  Object.entries(ELEMENTS).forEach(([name, tag]) =>
    app.component(name, element(tag)),
  );
  const html = await renderToString(app);
  vi.unstubAllGlobals();
  return html;
}

const templates = Object.entries(emailModules).map(
  ([path, module]) => [templateName(path), module.default] as const,
);

describe("built-in emails", () => {
  it.each(templates)(
    "%s leaves out a logo mail clients cannot load",
    async (_name, component) => {
      const html = await renderEmail(component, SVG_LOGO);
      expect(html).not.toContain("<img");
    },
  );

  it.each(templates)("%s draws a public PNG logo", async (_name, component) => {
    const html = await renderEmail(component, PUBLIC_PNG_LOGO);
    expect(html).toContain(`<img src="${PUBLIC_BASE}${PUBLIC_PNG_LOGO}"`);
  });

  it.each(templates)(
    "%s draws the email logo, with its dark variant",
    async (_name, component) => {
      const html = await renderEmail(component, EMAIL_LOGOS);
      expect(html).toContain(
        `<source media="(prefers-color-scheme: dark)" srcset="${PUBLIC_BASE}/branding/email-dark.png">`,
      );
      expect(html).toContain(`<img src="${PUBLIC_BASE}/branding/email.png"`);
    },
  );

  it.each(templates)("%s is written in French", async (_name, component) => {
    const html = await renderEmail(component, PUBLIC_PNG_LOGO, "fr");
    expect(html).toContain("Bonjour");
    expect(html).not.toMatch(/Hello|If you/);
  });

  it("words the code lifetime in the recipient's language", async () => {
    const [, component] = templates.find(
      ([name]) => name === "EmailResetPassword",
    )!;
    expect(await renderEmail(component, PUBLIC_PNG_LOGO)).toContain(
      "This code expires in 24 hours.",
    );
    expect(await renderEmail(component, PUBLIC_PNG_LOGO, "fr")).toContain(
      "Ce code expire dans 24 heures.",
    );
  });

  it("marks a partial export in French", async () => {
    const [, component] = templates.find(
      ([name]) => name === "EmailExportReady",
    )!;
    const html = await renderEmail(component, PUBLIC_PNG_LOGO, "fr");
    expect(html).toContain("<strong>incomplet</strong>");
    expect(html.replace(/<!--[^>]*-->/g, "")).toContain("— media.");
  });

  it("puts the two-factor disclaimer under the separator", async () => {
    const [, component] = templates.find(
      ([name]) => name === "EmailTwoFactor",
    )!;
    const html = await renderEmail(component, PUBLIC_PNG_LOGO);
    const separator = html.indexOf("<hr>");
    expect(separator).toBeGreaterThan(-1);
    expect(html.indexOf("If you did not attempt to sign in")).toBeGreaterThan(
      separator,
    );
  });
});
