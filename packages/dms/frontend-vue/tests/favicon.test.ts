/** @vitest-environment jsdom */
/**
 * The favicon plugin: the `<link rel="icon">` tags it declares from
 * `branding.logo.favicon`, their type and color-scheme media, and the icon
 * following an app config the loader replaces in development.
 */
import { useHead } from "@unhead/vue";
import {
  createHead as createClientHead,
  renderDOMHead,
} from "@unhead/vue/client";
import { createHead, renderSSRHead } from "@unhead/vue/server";
import { createApp, createSSRApp, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import layoutAppConfig from "../layers/dms-layout/app/app.config";
import type { DmsLogoSources } from "../layers/dms-core/shared/types/app-config";

interface FaviconAppConfig {
  branding: { logo?: { favicon?: Partial<DmsLogoSources> } };
}

const ANTELOPE_ICON = "/images/antelope-logo/icon.svg";
const ICON_TAG_START = '<link rel="icon"';

const appConfig = ref<FaviconAppConfig>({ branding: {} });

vi.stubGlobal("defineDmsPlugin", (setup: unknown) => setup);
vi.stubGlobal("useHead", useHead);
vi.stubGlobal("useDmsAppConfig", () => appConfig.value);

const { default: faviconPlugin } = await import(
  "../layers/dms-layout/app/plugins/favicon"
);

function useFavicon(favicon?: Partial<DmsLogoSources>): void {
  appConfig.value = { branding: { logo: { favicon } } };
}

async function renderIconTags(): Promise<string[]> {
  const app = createSSRApp({ render: () => null });
  const head = createHead();
  app.use(head);
  app.runWithContext(() => faviconPlugin({} as never));
  const { headTags } = await renderSSRHead(head);
  return headTags.split("\n").filter((tag) => tag.startsWith(ICON_TAG_START));
}

beforeEach(() => {
  appConfig.value = { branding: {} };
  document.head.innerHTML = "";
});

describe("server render", () => {
  it("declares the DMS's collapsed icon by default", async () => {
    appConfig.value = layoutAppConfig;

    expect(await renderIconTags()).toEqual([
      `<link rel="icon" href="${ANTELOPE_ICON}" type="image/svg+xml">`,
    ]);
  });

  it("declares a light and a dark icon that follow the system scheme", async () => {
    useFavicon({
      light: "/branding/icon-light.png",
      dark: "/branding/icon-dark.png",
    });

    expect(await renderIconTags()).toEqual([
      '<link rel="icon" href="/branding/icon-light.png" type="image/png" media="(prefers-color-scheme: light)">',
      '<link rel="icon" href="/branding/icon-dark.png" type="image/png" media="(prefers-color-scheme: dark)">',
    ]);
  });

  it.each([
    ["/favicon.ico", "image/x-icon"],
    ["/branding/icon.WEBP", "image/webp"],
    ["https://cdn.example.com/icon.svg?v=2", "image/svg+xml"],
  ])("types %s as %s", async (icon, type) => {
    useFavicon({ light: icon, dark: icon });

    expect(await renderIconTags()).toEqual([
      `<link rel="icon" href="${icon}" type="${type}">`,
    ]);
  });

  it("leaves the type out for an extension it does not know", async () => {
    useFavicon({ light: "/icon", dark: "/icon" });

    expect(await renderIconTags()).toEqual(['<link rel="icon" href="/icon">']);
  });

  it("declares the one file it has when the other mode has none", async () => {
    useFavicon({ light: "/icon.png", dark: "" });

    expect(await renderIconTags()).toEqual([
      '<link rel="icon" href="/icon.png" type="image/png">',
    ]);
  });

  it("declares no icon without a favicon, leaving the loader's placeholder", async () => {
    expect(await renderIconTags()).toEqual([]);
  });
});

describe("in the browser", () => {
  it("swaps the icon when the app config is replaced", async () => {
    useFavicon({ light: "/before.png", dark: "/before.png" });
    const app = createApp({ render: () => null });
    const head = createClientHead();
    app.use(head);
    app.runWithContext(() => faviconPlugin({} as never));
    await renderDOMHead(head);
    expect(
      document.head.querySelector("link[rel=icon]")?.getAttribute("href"),
    ).toBe("/before.png");

    useFavicon({ light: "/after.svg", dark: "/after-dark.svg" });
    await nextTick();
    await renderDOMHead(head);

    const icons = [...document.head.querySelectorAll("link[rel=icon]")].map(
      (link) => [link.getAttribute("href"), link.getAttribute("media")],
    );
    expect(icons).toEqual([
      ["/after.svg", "(prefers-color-scheme: light)"],
      ["/after-dark.svg", "(prefers-color-scheme: dark)"],
    ]);
  });
});
