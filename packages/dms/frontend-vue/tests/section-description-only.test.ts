import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DmsSection from "../layers/dms-ui/app/components/section/Section.vue";

vi.mock("../layers/dms-core/app/composables/watch/useWatch", () => ({
  useWatch: () => ({}),
}));

beforeEach(() => {
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
});

afterEach(() => vi.unstubAllGlobals());

function render(props: Record<string, unknown>): Promise<string> {
  return renderToString(
    createSSRApp({
      render: () => h(DmsSection, props, { default: () => "Rows" }),
    }),
  );
}

it("shows a section's description even when it has no title", async () => {
  const html = await render({ description: "Shown under the heading" });
  expect(html).toContain("Shown under the heading");
});

it("still draws no header for a section with neither", async () => {
  const html = await render({});
  expect(html).not.toContain("<header");
  expect(html).toContain("Rows");
});
