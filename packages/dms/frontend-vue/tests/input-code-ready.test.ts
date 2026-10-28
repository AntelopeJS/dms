/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as Vue from "vue";
import InputCode from "../layers/dms-ui/app/components/form/components/InputCode.vue";

let app: Vue.App | undefined;

beforeEach(() => {
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value);
  vi.stubGlobal("useI18n", () => ({ t: String }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

it("replaces the static code with the initialized editor", async () => {
  const root = document.createElement("div");
  app = Vue.createApp({
    render: () =>
      Vue.h(InputCode, {
        language: "json",
        modelValue: '{"name":"Ada"}',
        fill: true,
      }),
  });
  app.component("UKbd", Vue.defineComponent({ render: () => Vue.h("kbd") }));
  app.mount(root);
  expect(root.querySelector("pre")?.textContent).toContain('"Ada"');
  await vi.waitFor(() => {
    expect(root.querySelector(".cm-editor")?.textContent).toContain('"Ada"');
    expect(root.querySelector("pre")).toBeNull();
  });
});
