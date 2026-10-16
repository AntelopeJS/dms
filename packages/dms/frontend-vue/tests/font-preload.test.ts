/**
 * The faces of the dashboard: files of the build (named after their content,
 * cached for good), and only the one every page sets its text in preloaded.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const LAYER = resolve(__dirname, "../layers/dms-layout");
const STYLESHEET = resolve(LAYER, "app/assets/css/main.css");
const FONT_FACE_URL = /@font-face\s*{[^}]*?src:\s*url\("([^"]+)"\)/g;

interface HeadInput {
  link: Array<Record<string, string>>;
}

describe("the dashboard fonts", () => {
  it("are imported by the stylesheet, not named under public/", () => {
    const css = readFileSync(STYLESHEET, "utf8");
    const urls = [...css.matchAll(FONT_FACE_URL)].map(([, url]) => url);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      // A relative URL: Vite emits the file under /assets/ with its hash.
      expect(url.startsWith("/")).toBe(false);
      expect(existsSync(resolve(dirname(STYLESHEET), url))).toBe(true);
    }
  });

  it("preloads the text face alone, by the build's own URL", async () => {
    const heads: HeadInput[] = [];
    vi.stubGlobal("defineDmsPlugin", (setup: unknown) => setup);
    vi.stubGlobal("useHead", (input: HeadInput) => heads.push(input));
    vi.stubEnv("SSR", true);
    try {
      const plugin = (
        await import("../layers/dms-layout/app/plugins/font-preload")
      ).default as unknown as () => void;
      plugin();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
    const links = heads.flatMap((head) => head.link);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      rel: "preload",
      as: "font",
      type: "font/woff2",
      crossorigin: "anonymous",
    });
    expect(links[0]!.href).toMatch(/Geist-Variable\.woff2$/);
    expect(links[0]!.href).not.toMatch(/^\/fonts\//);
  });
});
