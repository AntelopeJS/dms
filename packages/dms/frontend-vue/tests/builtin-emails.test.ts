import { describe, expect, it, vi } from "vitest";
import { type Component, createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createI18n } from "vue-i18n";
import en from "../layers/dms-layout/i18n/locales/layout-en-GB.json";

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

function templateName(path: string): string {
  return path.split("/").pop()?.replace(".vue", "") ?? path;
}

async function renderEmail(component: Component, logo: string) {
  vi.stubGlobal("useDmsAppConfig", () => ({
    branding: { logo: { default: { light: logo } } },
  }));
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { clientBaseUrl: PUBLIC_BASE } },
  }));
  const app = createSSRApp(component, { userName: "Ada", failedSources: [] });
  app.use(createI18n({ legacy: false, locale: "en", messages: { en } }));
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
