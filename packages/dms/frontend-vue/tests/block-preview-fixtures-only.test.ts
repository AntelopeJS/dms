// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type App, createApp, defineComponent, h, shallowRef } from "vue";
import { useBlockPreviewEmbed } from "../layers/dms-ui/app/entries/composables/block-preview/useBlockPreviewEmbed";

const POLICY = 'meta[http-equiv="Content-Security-Policy"]';
const LIVE = [
  "/api/dashboard/kpi/revenue",
  "/api/files/metadata?resourceKey=k",
  "/api/user/list",
  "/avatar.png",
  "https://elsewhere.test/api/mockup/demo/pages/p/fixtures/k",
];

let app: App | undefined;

class FakeResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

/** Mounts the embed side of `/dms-preview`, and answers the policy its document then carries. */
function mountEmbed(fixturesOnly: boolean): string | undefined {
  const host = document.createElement("div");
  document.body.append(host);
  app = createApp(
    defineComponent({
      setup() {
        const root = shallowRef<HTMLElement | null>(null);
        useBlockPreviewEmbed({
          root,
          initialState: undefined,
          setLocale: () => undefined,
          fixturesOnly,
        });
        return () => h("div", { ref: root });
      },
    }),
  );
  app.mount(host);
  return (
    document.head.querySelector(POLICY)?.getAttribute("content") ?? undefined
  );
}

/** The sources the browser applies to `directive` of `policy`: its own, else `default-src`'s. */
function sourcesOf(policy: string, directive: string): string[] {
  const entries = policy.split(";").map((part) => part.trim().split(/\s+/));
  const entry =
    entries.find(([name]) => name === directive) ??
    entries.find(([name]) => name === "default-src");
  return entry ? entry.slice(1) : [];
}

/** The kinds of load a value a block draws can start, by their directive. */
const LOADS = [
  "img-src",
  "media-src",
  "font-src",
  "style-src",
  "worker-src",
  "manifest-src",
  "connect-src",
];

/** Whether a CSP source list admits `url`, as a browser matches a scheme, a host or a path prefix. */
function admits(sources: readonly string[], url: string): boolean {
  const target = new URL(url, window.location.origin);
  return sources.some((source) => {
    if (source === "*" || source === "'self'") return true;
    if (source.startsWith("'")) return false;
    if (source.endsWith(":") && !source.includes("/"))
      return target.protocol === source;
    const allowed = new URL(source);
    if (allowed.origin !== target.origin) return false;
    return allowed.pathname.endsWith("/")
      ? target.pathname.startsWith(allowed.pathname)
      : target.pathname === allowed.pathname;
  });
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.head.querySelectorAll(POLICY).forEach((meta) => meta.remove());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("a preview drawn on fixtures", () => {
  it("lets no image, media, style, font, worker, manifest or connection reach a route outside the mockup's own", () => {
    const policy = mountEmbed(true) ?? "";
    for (const directive of LOADS) {
      const sources = sourcesOf(policy, directive);
      expect(sources.length, directive).toBeGreaterThan(0);
      for (const url of LIVE)
        expect(admits(sources, url), `${directive} ${url}`).toBe(false);
    }
    expect(sourcesOf(policy, "frame-src")).toEqual(["'none'"]);
    expect(sourcesOf(policy, "object-src")).toEqual(["'none'"]);
  });

  it("still reads the mockup's fixtures, its realtime session and its assets", () => {
    const policy = mountEmbed(true) ?? "";
    const connect = sourcesOf(policy, "connect-src");
    const images = sourcesOf(policy, "img-src");
    expect(
      admits(connect, "/api/mockup/demo/pages/p/fixtures/k/rows?offset=0"),
    ).toBe(true);
    expect(admits(connect, "/api/realtime/session")).toBe(true);
    expect(admits(images, "/_nuxt/logo.svg")).toBe(true);
    expect(admits(images, "/images/logo.svg")).toBe(true);
    expect(admits(sourcesOf(policy, "font-src"), "/assets/inter.woff2")).toBe(
      true,
    );
    expect(admits(images, "data:image/png;base64,AA==")).toBe(true);
  });

  it("puts no policy on a preview that reads live routes, such as a docs or Real data one", () => {
    expect(mountEmbed(false)).toBeUndefined();
  });
});
