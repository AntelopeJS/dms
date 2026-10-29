// @vitest-environment jsdom
/**
 * Keyboard hints across a server render and its hydration, on the renderer's
 * own runtime (cookies, transferred state, `isDmsHydrating`, the page
 * `<Suspense>`), laid out as a dashboard page is: a hint in the layout, which
 * hydrates and mounts at once, and one in the page, an async component the
 * browser hydrates once its chunk has loaded. The layout's hint, once mounted,
 * corrects the platform cookie; the page's hint, hydrating after that, must
 * still draw what the server drew, then show the browser's platform.
 */
import {
  createSSRApp,
  defineAsyncComponent,
  defineComponent,
  h,
  nextTick,
  ref,
  Suspense,
  type App,
  type Component,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DmsFrontendRuntime } from "#dms/frontend-module";
import {
  KEYBOARD_PLATFORM_COOKIE,
  useKeyboardPlatform,
} from "../layers/dms-ui/app/composables/global/keyboardPlatform";

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
let app: App | undefined;

beforeEach(async () => {
  vi.resetModules();
  engine = await import("#dms/frontend-module");
  vi.stubGlobal("useDmsCookie", engine.useDmsCookie);
  vi.stubGlobal("useDmsState", engine.useDmsState);
  vi.stubGlobal("isDmsHydrating", engine.isDmsHydrating);
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

/** Every label a hint drew, in order, first render included. */
const drawn: string[] = [];

const Hint = defineComponent({
  props: { name: { type: String, required: true } },
  setup(props) {
    const { formatShortcut } = useKeyboardPlatform();
    return () => {
      const label = formatShortcut(["meta", "v"]);
      drawn.push(`${props.name}:${label}`);
      return h("kbd", label);
    };
  },
});

/**
 * The dashboard's shape: the layout's hint, then the page in the renderer's
 * page `<Suspense>`, the page an async component as every DMS page is.
 */
function dashboard(pageLoadDelay: number): Component {
  const Page = defineAsyncComponent(
    () =>
      new Promise<Component>((resolve) =>
        setTimeout(
          () => resolve(defineComponent(() => () => h(Hint, { name: "page" }))),
          pageLoadDelay,
        ),
      ),
  );
  return defineComponent({
    setup() {
      const suspense = engine.dmsPageSuspenseProps();
      return () =>
        h("main", [
          h(Hint, { name: "layout" }),
          h(Suspense, suspense, { default: () => h(Page) }),
        ]);
    },
  });
}

function withRuntime(root: Component, runtime: DmsFrontendRuntime): App {
  const created = createSSRApp(root);
  engine.provideDmsFrontendRuntime(created, runtime);
  return created;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 80));

/**
 * Renders the dashboard for a request carrying `cookie` (no browser around),
 * then hydrates it in `browser`, from the page's payload and the same cookie.
 */
async function visit(
  cookie: string | undefined,
  browser: keyof typeof BROWSERS,
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
  const html = await renderToString(withRuntime(dashboard(0), server));
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
  drawn.length = 0;
  const runtime = engine.createDmsFrontendRuntime();
  engine.restoreDmsPayload(runtime, payload);
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  app = withRuntime(dashboard(20), runtime);
  app.mount(host);
  await settle();
  await nextTick();
  return {
    serverHints: [...html.matchAll(/<kbd>([^<]*)<\/kbd>/g)].map((m) => m[1]),
    hydrated: drawn.slice(),
    hints: [...host.querySelectorAll("kbd")].map((kbd) => kbd.textContent),
    warnings,
    hydrating: runtime.hydrating,
    cookie: engine.useDmsCookie(KEYBOARD_PLATFORM_COOKIE).value,
  };
}

describe("keyboard hints through a server render and its hydration", () => {
  it.each([
    ["a first visit (no cookie)", undefined],
    ["a stale cookie", "other"],
  ])(
    "hydrates a macOS browser's page rendered from %s, then shows ⌘",
    async (_case, cookie) => {
      const result = await visit(cookie, "mac");
      expect(result.serverHints).toEqual(["Ctrl V", "Ctrl V"]);
      expect(result.warnings).toEqual([]);
      expect(result.hydrated.indexOf("layout:⌘V")).toBeGreaterThan(-1);
      expect(result.hydrated.indexOf("layout:⌘V")).toBeLessThan(
        result.hydrated.findIndex((label) => label.startsWith("page:")),
      );
      expect(result.hydrated.find((label) => label.startsWith("page:"))).toBe(
        "page:Ctrl V",
      );
      expect(result.hints).toEqual(["⌘V", "⌘V"]);
      expect(result.cookie).toBe("mac");
      expect(result.hydrating).toBe(false);
    },
  );

  it("renders ⌘ on the server from the cookie of a returning macOS browser", async () => {
    const result = await visit("mac", "mac");
    expect(result.serverHints).toEqual(["⌘V", "⌘V"]);
    expect(result.warnings).toEqual([]);
    expect(result.hints).toEqual(["⌘V", "⌘V"]);
  });

  it("keeps Ctrl for a Linux browser's first visit", async () => {
    const result = await visit(undefined, "linux");
    expect(result.serverHints).toEqual(["Ctrl V", "Ctrl V"]);
    expect(result.warnings).toEqual([]);
    expect(result.hints).toEqual(["Ctrl V", "Ctrl V"]);
    expect(result.cookie).toBe("other");
  });

  it("draws the browser's platform at once in a hint created after the hydration", async () => {
    await visit(undefined, "mac");
    drawn.length = 0;
    const shown = ref(false);
    const later = withRuntime(
      defineComponent(
        () => () => (shown.value ? h(Hint, { name: "later" }) : null),
      ),
      engine.createDmsFrontendRuntime(),
    );
    const host = document.createElement("div");
    document.body.appendChild(host);
    later.mount(host);
    shown.value = true;
    await nextTick();
    expect(drawn).toEqual(["later:⌘V"]);
    later.unmount();
  });
});
