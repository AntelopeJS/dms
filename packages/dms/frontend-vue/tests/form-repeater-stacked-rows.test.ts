// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import * as Vue from "vue";
import { useFormField } from "@nuxt/ui/composables/useFormField";
import Repeater from "../layers/dms-ui/app/components/form/components/Repeater.vue";

let app: Vue.App | undefined;

afterEach(() => {
  app?.unmount();
  vi.unstubAllGlobals();
});

it("hides the column heads and labels each field once stacked", async () => {
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value);
  vi.stubGlobal("useFormField", useFormField);
  vi.stubGlobal("useI18n", () => ({ t: String }));
  const host = document.createElement("div");
  app = Vue.createApp({
    render: () =>
      Vue.h(Repeater, {
        columns: ["Product", "Quantity", "Optional"].map((label) => ({
          id: label.toLowerCase(),
          label,
          component: { componentName: "input" },
        })),
        modelValue: [
          { product: "Panel", quantity: 251 },
          { product: "Inverter", quantity: 2 },
        ],
      }),
  });
  app.mount(host);
  await Vue.nextTick();
  expect(host.querySelector("[aria-hidden=true]")?.textContent).toContain(
    "Product",
  );
  expect(host.querySelectorAll("input")).toHaveLength(6);
  expect(
    [...host.querySelectorAll("input")].map((input) =>
      input.getAttribute("aria-label"),
    ),
  ).toEqual([
    "Product",
    "Quantity",
    "Optional",
    "Product",
    "Quantity",
    "Optional",
  ]);
  for (const label of ["Product", "Quantity", "Optional"]) {
    expect(
      [...host.querySelectorAll("span")].filter(
        (span) => span.textContent?.trim() === label,
      ),
    ).toHaveLength(3);
  }
});
