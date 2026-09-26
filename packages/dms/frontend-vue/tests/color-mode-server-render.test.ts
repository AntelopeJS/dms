/**
 * The color-mode plugin as the server runs it: the `<html>` tag of the rendered
 * document already carries an explicit preference, so the first paint is right
 * without waiting for JavaScript, and `system` is left to the pre-paint script.
 */
import { useHead } from "@unhead/vue";
import { createHead, renderSSRHead } from "@unhead/vue/server";
import { createSSRApp, ref } from "vue";
import { beforeEach, expect, it, vi } from "vitest";

interface CookieOptions {
  default: () => unknown;
  maxAge?: number;
}

const COLOR_MODE_COOKIE = "dms-color-mode";
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;
const requestCookies = new Map<string, unknown>();
const cookieReads = vi.fn();

vi.stubGlobal("defineDmsPlugin", (setup: unknown) => setup);
vi.stubGlobal("useHead", useHead);
vi.stubGlobal("useDmsCookie", (name: string, options: CookieOptions) => {
  cookieReads(name, options);
  return ref(
    requestCookies.has(name) ? requestCookies.get(name) : options.default(),
  );
});

const { default: colorModePlugin } = await import(
  "../layers/dms-layout/app/plugins/color-mode"
);

async function renderHead(preference?: string) {
  if (preference !== undefined)
    requestCookies.set(COLOR_MODE_COOKIE, preference);
  const app = createSSRApp({ render: () => null });
  const head = createHead();
  app.use(head);
  await app.runWithContext(() => colorModePlugin({} as never));
  return renderSSRHead(head);
}

beforeEach(() => {
  requestCookies.clear();
  cookieReads.mockClear();
});

it.each(["light", "dark"])(
  "renders the %s class on <html> for an explicit preference",
  async (preference) => {
    const { htmlAttrs } = await renderHead(preference);

    expect(htmlAttrs).toContain(` class="${preference}"`);
  },
);

it.each([undefined, "system", "sepia"])(
  "leaves the class to the browser for a %s preference",
  async (preference) => {
    const { htmlAttrs } = await renderHead(preference);

    expect(htmlAttrs).not.toContain("class");
  },
);

it("reads the dms-color-mode cookie, kept a year and defaulting to system", async () => {
  await renderHead();

  expect(cookieReads).toHaveBeenCalledOnce();
  const [name, options] = cookieReads.mock.calls[0] as [string, CookieOptions];
  expect(name).toBe(COLOR_MODE_COOKIE);
  expect(options.maxAge).toBe(ONE_YEAR_IN_SECONDS);
  expect(options.default()).toBe("system");
});

it("ships the pre-paint script as a classic inline script in <head>", async () => {
  // No src, type, defer or async: the browser runs it while it parses <head>,
  // before the deferred entry module that installs Nuxt UI.
  const { headTags, bodyTags, bodyTagsOpen } = await renderHead("dark");

  expect(headTags).toMatch(/<script id="dms-color-mode">\(\(\) => \{/);
  expect(bodyTags + bodyTagsOpen).toBe("");
});
