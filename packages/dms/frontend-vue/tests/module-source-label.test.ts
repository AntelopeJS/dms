import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, expect, it, vi } from "vitest";
import ModuleSourceLabel from "../layers/dms-layout/app/build/components/pages/modules/ModuleSourceLabel.vue";

afterEach(() => vi.unstubAllGlobals());

it("names the source beside its icon", async () => {
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => `[${key}]` }));
  const app = createSSRApp({
    render: () => h(ModuleSourceLabel, { source: "npm" }),
  });
  app.component("UIcon", () => null);
  const html = await renderToString(app);
  expect(html).toContain("[modules.source.npm]");
  expect(html).not.toContain("sr-only");
});
