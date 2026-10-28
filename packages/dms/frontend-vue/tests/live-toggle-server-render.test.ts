/**
 * The LiveToggle block as the server renders it: drawn at once on a page that
 * declares `live`, live and without its "updated N s ago" text (the browser's
 * clock writes it once mounted), so the toggle holds its place before the
 * page hydrates; nothing on a page without `live`.
 */
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { provideServerPageLive } from "../layers/dms-ui/app/entries/composables/live/currentPageLive";
import LiveToggleBlock from "../layers/dms-ui/app/components/blocks/LiveToggleBlock.vue";
import { engine } from "./helpers/api-data-runtime";

const t = (key: string) => key;

async function render(
  isLive: boolean,
  props: Partial<InstanceType<typeof LiveToggleBlock>["$props"]> = {},
): Promise<string> {
  const Page = defineComponent({
    setup() {
      provideServerPageLive(() => isLive);
      return () =>
        h(LiveToggleBlock, {
          componentId: "live",
          pageId: "api.logs",
          ...props,
        });
    },
  });
  const app = createSSRApp(Page);
  engine.provideDmsFrontendRuntime(
    app,
    engine.createDmsFrontendRuntime(undefined, {}, true),
  );
  app.component("UIcon", () => h("i"));
  app.component("UButton", () => h("button"));
  return renderToString(app);
}

beforeEach(() => {
  vi.stubGlobal("useI18n", () => ({ t }));
  vi.stubGlobal("defineShortcuts", () => {});
  vi.stubGlobal("isDmsHydrating", engine.isDmsHydrating);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("draws the toggle of a live page, live, before the browser mounts it", async () => {
  const html = await render(true);
  expect(html).toContain("dms-live-toggle");
  expect(html).toContain("dms.live.direct");
  expect(html).toContain("dms.live.pause");
  expect(html).not.toContain("dms.live.updated");
});

it("draws the pill variant live too", async () => {
  const html = await render(true, { variant: "pill" });
  expect(html).toMatch(/data-value="direct"[^>]*aria-pressed="true"/);
  expect(html).not.toContain('data-action="resume"');
});

it("draws nothing on a page without live", async () => {
  expect(await render(false)).not.toContain("dms-live-toggle");
});
