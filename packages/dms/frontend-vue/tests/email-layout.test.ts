import { describe, expect, it, vi } from "vitest";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import EmailLayout from "../layers/dms-layout/app/emails/components/EmailLayout.vue";
import { emailLogoUrl } from "../layers/dms-layout/app/emails/components/index";

const PUBLIC_BASE = "https://admin.example.com";
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
  logo = "/images/logo.png",
  clientBaseUrl = PUBLIC_BASE,
): Promise<string> {
  vi.stubGlobal("useDmsAppConfig", () => ({
    branding: { logo: { default: { light: logo } } },
  }));
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

  it("leaves out a logo a mail client cannot load", async () => {
    expect(
      await renderLayout({ title: "Hi" }, "/images/logo.svg"),
    ).not.toContain("<img");
    expect(
      await renderLayout({ title: "Hi" }, "/logo.png", "http://localhost:3001"),
    ).not.toContain("<img");
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
