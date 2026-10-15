import { describe, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import EmailLayout from "../layers/dms-layout/app/emails/components/EmailLayout.vue";
import { emailLogoUrl } from "../layers/dms-layout/app/emails/components/index";
import type { DmsLogoSources } from "../layers/dms-core/shared/types/app-config";

/** `branding.logo` as an email reads it: a path stands for `default.light`. */
interface EmailLogos {
  default?: Partial<DmsLogoSources>;
  email?: Partial<DmsLogoSources>;
}

const PUBLIC_BASE = "https://admin.example.com";
const DARK_SOURCE_MEDIA = 'media="(prefers-color-scheme: dark)"';
const ELEMENTS: Record<string, string> = {
  EHtml: "html",
  EHead: "head",
  EBody: "body",
  EContainer: "div",
  ESection: "section",
  EHeading: "h1",
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
        h(tag, { src: attrs.src, alt: attrs.alt }, slots.default?.()),
  });
}

async function renderLayout(
  props: Record<string, unknown>,
  logo: string | EmailLogos = "/images/logo.png",
  clientBaseUrl = PUBLIC_BASE,
): Promise<string> {
  const logos = typeof logo === "string" ? { default: { light: logo } } : logo;
  vi.stubGlobal("useDmsAppConfig", () => ({ branding: { logo: logos } }));
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { clientBaseUrl } },
  }));
  const app = createSSRApp({
    render: () =>
      h(EmailLayout, props, {
        default: () => h("p", "Body"),
        footer: () => h("small", "Footer"),
      }),
  });
  Object.entries(ELEMENTS).forEach(([name, tag]) =>
    app.component(name, element(tag)),
  );
  const html = await renderToString(app);
  vi.unstubAllGlobals();
  return html;
}

describe("EmailLayout", () => {
  it("keeps the heading, the separator and the logo by default", async () => {
    const html = await renderLayout({ title: "Welcome" });
    expect(html).toContain("<h1>Welcome</h1>");
    expect(html).toContain("<hr>");
    expect(html).toContain(
      `<img src="${PUBLIC_BASE}/images/logo.png" alt="Logo">`,
    );
  });

  it("drops the heading without a title and the separator on request", async () => {
    const html = await renderLayout({ divider: false, preheader: "Preview" });
    expect(html).not.toContain("<h1>");
    expect(html).not.toContain("<hr>");
    expect(html).toContain("<span>Preview</span>");
    expect(html).toContain("<p>Body</p>");
    expect(html).toContain("<small>Footer</small>");
  });

  it("keeps any logo by default", async () => {
    expect(
      await renderLayout({ title: "Hi" }, "/images/logo.svg", ""),
    ).toContain('<img src="/images/logo.svg" alt="Logo">');
  });

  it("leaves out a logo a mail client cannot load with publicLogoOnly", async () => {
    const guarded = { title: "Hi", publicLogoOnly: true };
    expect(await renderLayout(guarded, "/images/logo.svg")).not.toContain(
      "<img",
    );
    expect(
      await renderLayout(guarded, "/logo.png", "http://localhost:3001"),
    ).not.toContain("<img");
    expect(await renderLayout(guarded)).toContain(
      `<img src="${PUBLIC_BASE}/images/logo.png" alt="Logo">`,
    );
  });
});

describe("EmailLayout email logo", () => {
  const guarded = { title: "Hi", publicLogoOnly: true };

  it("draws the email logo in place of the default one", async () => {
    const html = await renderLayout(guarded, {
      default: { light: "/images/logo.svg" },
      email: { light: "/branding/email.png" },
    });
    expect(html).toContain(
      `<img src="${PUBLIC_BASE}/branding/email.png" alt="Logo">`,
    );
    expect(html).not.toContain("<picture>");
  });

  it("offers the dark email logo to the clients in dark mode", async () => {
    const html = await renderLayout(guarded, {
      email: { light: "/branding/email.png", dark: "/branding/email-dark.png" },
    });
    expect(html).toContain(
      `<picture><source ${DARK_SOURCE_MEDIA} srcset="${PUBLIC_BASE}/branding/email-dark.png"><img src="${PUBLIC_BASE}/branding/email.png" alt="Logo"></picture>`,
    );
  });

  it("keeps a single image when the dark logo is the same or unusable", async () => {
    for (const dark of ["/branding/email.png", "/branding/email-dark.svg"]) {
      const html = await renderLayout(guarded, {
        email: { light: "/branding/email.png", dark },
      });
      expect(html).not.toContain("<picture>");
      expect(html).toContain(
        `<img src="${PUBLIC_BASE}/branding/email.png" alt="Logo">`,
      );
    }
  });

  it("draws no dark logo without a light one", async () => {
    const html = await renderLayout(guarded, {
      default: { light: "/images/logo.svg" },
      email: { light: "", dark: "/branding/email-dark.png" },
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<source");
  });

  it("falls back to the default logo without an email one", async () => {
    const html = await renderLayout(guarded, {
      default: { light: "/images/logo.png", dark: "/images/logo-dark.png" },
    });
    expect(html).not.toContain("<picture>");
    expect(html).toContain(
      `<img src="${PUBLIC_BASE}/images/logo.png" alt="Logo">`,
    );
  });
});

describe("emailLogoUrl", () => {
  it("resolves a root path against the public base URL", () => {
    expect(emailLogoUrl("/logo.png", PUBLIC_BASE)).toBe(
      `${PUBLIC_BASE}/logo.png`,
    );
    expect(emailLogoUrl("https://cdn.example.com/logo.png", "")).toBe(
      "https://cdn.example.com/logo.png",
    );
  });

  it.each([
    [undefined, PUBLIC_BASE],
    ["/logo.svg", PUBLIC_BASE],
    ["https://cdn.example.com/logo.SVG?v=2", ""],
    ["data:image/png;base64,AAAA", ""],
    ["/logo.png", ""],
    ["/logo.png", "http://localhost:3001"],
    ["/logo.png", "http://dms.localhost"],
    ["/logo.png", "http://127.0.0.1:3001"],
    ["/logo.png", "http://10.0.0.5"],
    ["/logo.png", "http://172.20.1.1"],
    ["/logo.png", "http://192.168.1.10"],
    ["/logo.png", "http://169.254.169.254"],
    ["/logo.png", "http://[::1]:3001"],
    ["/logo.png", "http://[fd00::1]"],
    ["/logo.png", "http://intranet.internal"],
  ])("leaves out %s on %s", (logo, base) => {
    expect(emailLogoUrl(logo, base)).toBe("");
  });
});
