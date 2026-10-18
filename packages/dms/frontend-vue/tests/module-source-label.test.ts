import { computed, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, expect, it, vi } from "vitest";
import ModuleSourceLabel from "../layers/dms-layout/app/build/components/pages/modules/ModuleSourceLabel.vue";

afterEach(() => vi.unstubAllGlobals());

async function render(isIconOnly: boolean): Promise<string> {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => `[${key}]` }));
  const app = createSSRApp({
    render: () => h(ModuleSourceLabel, { source: "npm", isIconOnly }),
  });
  app.component("UIcon", () => null);
  app.component("UTooltip", (_props, { slots }) => slots.default?.());
  return renderToString(app);
}

it("names the source beside its icon", async () => {
  const html = await render(false);
  expect(html).toContain("[modules.source.npm]");
  expect(html).not.toContain("sr-only");
});

it("keeps the name for screen readers when only the icon shows", async () => {
  const html = await render(true);
  expect(html).toMatch(
    /<span class="sr-only">\[modules\.source\.npm\]<\/span>/,
  );
});
