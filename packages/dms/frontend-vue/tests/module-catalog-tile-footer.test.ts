import { computed, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import ModuleCatalogTile from "../layers/dms-layout/app/entries/components/pages/modules/ModuleCatalogTile";

afterEach(() => vi.unstubAllGlobals());

const SOURCE_NAME = "[modules.source.npm]";

/** The installed tile's footer facts: version, source and category. */
async function renderFacts() {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => `[${key}]` }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) => value,
  }));
  const app = createSSRApp({
    render: () =>
      h(ModuleCatalogTile, {
        entry: {
          id: "media",
          title: "Media",
          description: "Images and files",
          icon: "i-ph-image",
          version: "0.5.0",
          source: "npm",
          catalogCategory: "Content",
        },
        to: "/media",
      }),
  });
  for (const name of ["DmsIconWell", "DmsStatusPill", "DmsCheckList", "UIcon"])
    app.component(name, () => null);
  app.component("UTooltip", (_props, { slots }) => slots.default?.());
  app.component("UButton", (props: { label?: string }) =>
    h("button", props.label),
  );
  const { document } = new JSDOM(await renderToString(app)).window;
  const version = [...document.querySelectorAll("span")].find(
    (span) => span.textContent?.trim() === "v0.5.0",
  );
  return [...(version?.parentElement?.children ?? [])];
}

function textOf(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

it("names the source beside its icon, as the store tile does", async () => {
  const facts = await renderFacts();
  expect(facts.map(textOf)).toEqual(["v0.5.0", "·", SOURCE_NAME, "· Content"]);
  expect(facts[2].querySelector(".sr-only")).toBeNull();
});
