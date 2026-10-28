import { computed, createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, expect, it, vi } from "vitest";
import ModuleTile from "../layers/dms-layout/app/entries/components/pages/modules/ModuleTile";

afterEach(() => vi.unstubAllGlobals());

it("reads the description before live figures, requirements, and footer actions", async () => {
  vi.stubGlobal("computed", computed);
  const app = createSSRApp({
    render: () =>
      h(
        ModuleTile,
        {
          icon: "i-ph-plugs",
          title: "API",
          description: "Inspect API traffic",
          status: { tone: "success", label: "Active" },
        },
        {
          readout: () => h("p", "No traffic in 24 h"),
          default: () => h("p", "Requires a compatible frontend"),
          footer: () => h("button", "Manage"),
        },
      ),
  });
  app.component("DmsIconWell", () => null);
  app.component("DmsStatusPill", () => null);
  const html = await renderToString(app);
  const content = [
    "Inspect API traffic",
    "No traffic in 24 h",
    "Requires a compatible frontend",
    "Manage",
  ];
  for (const text of content) expect(html).toContain(text);
  for (let index = 1; index < content.length; index++) {
    expect(html.indexOf(content[index - 1])).toBeLessThan(
      html.indexOf(content[index]),
    );
  }
});
