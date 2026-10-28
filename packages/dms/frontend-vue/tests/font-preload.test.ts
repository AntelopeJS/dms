/**
 * The faces of the dashboard: files of the build (named after their content,
 * cached for good), and only the one every page sets its text in preloaded.
 */
import { describe, expect, it, vi } from "vitest";

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
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The setup callback reads no argument. Its DmsPluginSetup owner requires an app context; this identity-stub fixture deliberately omits unused runtime services.
      const plugin = (
        await import("../layers/dms-layout/app/plugins/font-preload")
      ).default as () => void;
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
