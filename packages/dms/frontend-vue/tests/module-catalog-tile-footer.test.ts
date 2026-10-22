import { computed, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { JSDOM } from "jsdom";
import { afterEach, expect, it, vi } from "vitest";
import ModuleCatalogTile from "../layers/dms-layout/app/build/components/pages/modules/ModuleCatalogTile.vue";

vi.mock("#dms/frontend-module", () => ({ DmsLink: "a" }));
afterEach(() => vi.unstubAllGlobals());

const SOURCE_NAME = "[modules.source.npm]";

/** The installed tile's footer facts: version, source and category. */
async function renderFacts(): Promise<HTMLElement[]> {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => `[${key}]` }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: unknown) => value,
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
  return [...(version?.parentElement?.children ?? [])] as HTMLElement[];
}

function textOf(element: HTMLElement): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

it("names the source beside its icon, as the store tile does", async () => {
  const facts = await renderFacts();
  expect(facts.map(textOf)).toEqual(["v0.5.0", "·", SOURCE_NAME, "· Content"]);
  expect(facts[2].querySelector(".sr-only")).toBeNull();
});

// Vitest lays nothing out, so the footer's behaviour at the narrowest tile
// (313 px on a phone, measured in Chrome) rests on this contract: only the
// category gives way, and the facts never shrink below the version and the
// source -- with no room for those and the actions, the actions wrap rather
// than cover the source.
it("cuts only the category when the tile is narrow", async () => {
  const [version, , source, category] = await renderFacts();
  for (const whole of [version, source])
    expect([...whole.classList]).toEqual(
      expect.arrayContaining(["shrink-0", "whitespace-nowrap"]),
    );
  expect([...category.classList]).toEqual(
    expect.arrayContaining(["w-0", "min-w-0", "grow", "truncate"]),
  );
  expect([...(version.parentElement?.classList ?? [])]).not.toContain(
    "min-w-0",
  );
});
