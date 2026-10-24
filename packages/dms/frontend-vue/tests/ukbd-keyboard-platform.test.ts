// @vitest-environment jsdom
/**
 * Nuxt UI's key hints (`<UKbd value="meta">`) through a server render and its
 * hydration, on the renderer's own runtime: the renderer prints them through
 * `useDmsKbd`, from the platform an application provides
 * (`provideDmsKbdPlatform`), and the layer's `kbd-platform` plugin provides
 * the platform of the dashboard's own hints. The page is laid out as a
 * dashboard page is: a hint in the layout, which mounts at once, and one in
 * the page, an async component hydrated once its chunk has loaded.
 */
import {
  computed,
  createSSRApp,
  defineAsyncComponent,
  defineComponent,
  h,
  nextTick,
  Suspense,
  type App,
  type Component,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmsAppContext, DmsFrontendRuntime } from "#dms/frontend-module";
import { KEYBOARD_PLATFORM_COOKIE } from "../layers/dms-ui/app/composables/global/keyboardPlatform";

type Engine = typeof import("#dms/frontend-module");

const BROWSERS = {
  mac: {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    platform: "MacIntel",
    hint: "macOS",
  },
  linux: {
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    platform: "Linux x86_64",
    hint: "Linux",
  },
} as const;

let engine: Engine;
let kbdPlatformPlugin: ((context: DmsAppContext) => void) | undefined;
let app: App | undefined;

beforeEach(async () => {
  // A fresh renderer: the browser keeps one ref per cookie for the page's life.
  vi.resetModules();
  engine = await import("#dms/frontend-module");
  vi.stubGlobal("useDmsCookie", engine.useDmsCookie);
  vi.stubGlobal("useDmsState", engine.useDmsState);
  vi.stubGlobal("isDmsHydrating", engine.isDmsHydrating);
  vi.stubGlobal("provideDmsKbdPlatform", engine.provideDmsKbdPlatform);
  // A plugin's file calls the renderer's `defineDmsPlugin` as it loads.
  vi.stubGlobal("defineDmsPlugin", (setup: unknown) => setup);
  kbdPlatformPlugin = (
    await import("../layers/dms-ui/app/plugins/kbd-platform")
  ).default as unknown as (context: DmsAppContext) => void;
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  document.cookie = `${KEYBOARD_PLATFORM_COOKIE}=; max-age=0; path=/`;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window.navigator, "userAgentData");
});

function useBrowser(kind: keyof typeof BROWSERS): void {
  const browser = BROWSERS[kind];
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
    browser.userAgent,
  );
  vi.spyOn(window.navigator, "platform", "get").mockReturnValue(
    browser.platform,
  );
  Object.defineProperty(window.navigator, "userAgentData", {
    configurable: true,
    value: { platform: browser.hint },
  });
}

/**
 * `<UKbd value="meta">` as the DMS runs it: Nuxt UI's `useKbd` routed to the
 * renderer's `useDmsKbd`. Nuxt UI's own map knows the platform once mounted.
 */
const Kbd = defineComponent({
  setup() {
    const kbd = engine.useDmsKbd(
      () => ({
        macOS: computed(
          () =>
            typeof window !== "undefined" &&
            /mac/i.test(window.navigator.platform),
        ),
        getKbdKey: (value) => value,
      }),
      {},
    );
    return () => h("kbd", kbd.getKbdKey("meta"));
  },
});

/** The layout's hint, then the page in the renderer's page `<Suspense>`. */
function dashboard(pageLoadDelay: number): Component {
  const Page = defineAsyncComponent(
    () =>
      new Promise<Component>((resolve) =>
        setTimeout(
          () => resolve(defineComponent(() => () => h(Kbd))),
          pageLoadDelay,
        ),
      ),
  );
  return defineComponent({
    setup() {
      const suspense = engine.dmsPageSuspenseProps();
      return () =>
        h("main", [h(Kbd), h(Suspense, suspense, { default: () => h(Page) })]);
    },
  });
}

/** The DMS app: the runtime, and the layer's plugin unless left out. */
function dmsApp(
  root: Component,
  runtime: DmsFrontendRuntime,
  withPlugin: boolean,
): App {
  const created = createSSRApp(root);
  engine.provideDmsFrontendRuntime(created, runtime);
  if (withPlugin)
    created.runWithContext(() =>
      kbdPlatformPlugin!({ vueApp: created } as unknown as DmsAppContext),
    );
  return created;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

async function visit(
  cookie: string | undefined,
  browser: keyof typeof BROWSERS,
  withPlugin = true,
) {
  const requestCookies = cookie
    ? `${KEYBOARD_PLATFORM_COOKIE}=${encodeURIComponent(JSON.stringify(cookie))}`
    : "";
  const server = engine.createDmsFrontendRuntime(
    undefined,
    {},
    true,
    requestCookies,
  );
  const jsdomDocument = document;
  const jsdomWindow = window;
  vi.stubGlobal("document", undefined);
  vi.stubGlobal("window", undefined);
  const html = await renderToString(dmsApp(dashboard(0), server, withPlugin));
  vi.stubGlobal("document", jsdomDocument);
  vi.stubGlobal("window", jsdomWindow);
  const payload = structuredClone(engine.serializeDmsPayload(server));

  useBrowser(browser);
  if (cookie) document.cookie = `${requestCookies}; path=/`;
  const warnings: string[] = [];
  const collect = (...args: unknown[]) => {
    const text = args.map(String).join(" ");
    if (/hydration/i.test(text)) warnings.push(text);
  };
  vi.spyOn(console, "warn").mockImplementation(collect);
  vi.spyOn(console, "error").mockImplementation(collect);
  const runtime = engine.createDmsFrontendRuntime();
  engine.restoreDmsPayload(runtime, payload);
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  app = dmsApp(dashboard(20), runtime, withPlugin);
  app.mount(host);
  await settle();
  await nextTick();
  return {
    serverHints: [...html.matchAll(/<kbd>([^<]*)<\/kbd>/g)].map((m) => m[1]),
    hints: [...host.querySelectorAll("kbd")].map((kbd) => kbd.textContent),
    warnings,
  };
}

describe("Nuxt UI key hints through a server render and its hydration", () => {
  it("prints the cookie's ⌘ from the server on for a returning macOS visitor", async () => {
    const result = await visit("mac", "mac");
    expect(result.serverHints).toEqual(["⌘", "⌘"]);
    expect(result.warnings).toEqual([]);
    expect(result.hints).toEqual(["⌘", "⌘"]);
  });

  it("prints Ctrl for a macOS browser's first visit, then ⌘ without a mismatch", async () => {
    const result = await visit(undefined, "mac");
    expect(result.serverHints).toEqual(["Ctrl", "Ctrl"]);
    expect(result.warnings).toEqual([]);
    expect(result.hints).toEqual(["⌘", "⌘"]);
  });

  it("prints Ctrl for a Linux browser", async () => {
    const result = await visit(undefined, "linux");
    expect(result.serverHints).toEqual(["Ctrl", "Ctrl"]);
    expect(result.warnings).toEqual([]);
    expect(result.hints).toEqual(["Ctrl", "Ctrl"]);
  });

  it("prints a blank on the server without the layer's platform", async () => {
    const result = await visit("mac", "mac", false);
    expect(result.serverHints).toEqual([" ", " "]);
    expect(result.warnings).toEqual([]);
    expect(result.hints).toEqual(["⌘", "⌘"]);
  });
});
