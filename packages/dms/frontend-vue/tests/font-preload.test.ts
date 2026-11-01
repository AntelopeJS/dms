/**
 * The faces of the dashboard: files of the build (named after their content,
 * cached for good), and only the one every page sets its text in preloaded.
 */
import { createApp } from "vue";
import { describe, expect, it, vi } from "vitest";
import { dmsAppContext } from "./fixtures/dmsAppContext";

interface HeadInput {
  link: Array<Record<string, string>>;
}

describe("the dashboard fonts", () => {
  it("preloads the text face alone, by the build's own URL", async () => {
    const heads: HeadInput[] = [];
    vi.stubGlobal("defineDmsPlugin", <T>(setup: T) => setup);
    vi.stubGlobal("useHead", (input: HeadInput) => heads.push(input));
    vi.stubEnv("SSR", true);
    try {
      const { default: plugin } = await import(
        "../layers/dms-layout/app/plugins/font-preload"
      );
      plugin(dmsAppContext(createApp({ render: () => null })));
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
