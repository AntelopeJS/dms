// @vitest-environment jsdom
/**
 * The required-fields legend is a public component, auto-registered as
 * `DmsFormRequiredLegend`: a module's own form prints it like a stock one.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createApp, h } from "vue";
import { expect, it } from "vitest";
import FormRequiredLegend from "../layers/dms-ui/app/components/form/FormRequiredLegend.vue";

it("lives with the public components, not the layer's internals", () => {
  const layer = resolve(__dirname, "../layers/dms-ui/app");
  expect(existsSync(`${layer}/components/form/FormRequiredLegend.vue`)).toBe(
    true,
  );
  expect(
    existsSync(`${layer}/build/components/form/FormRequiredLegend.vue`),
  ).toBe(false);
});

it("prints the asterisk and the translated legend, with the caller's class", () => {
  const host = document.createElement("div");
  const app = createApp({
    render: () => h(FormRequiredLegend, { class: "mt-4" }),
  });
  app.config.globalProperties.$t = (key: string) => `t(${key})`;
  app.mount(host);
  const legend = host.querySelector("p")!;
  expect(legend.classList.contains("mt-4")).toBe(true);
  expect(legend.textContent).toContain("*");
  expect(legend.textContent).toContain("t(dms.form.required_legend)");
  app.unmount();
});
