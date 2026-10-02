// @vitest-environment jsdom
import {
  computed,
  createSSRApp,
  defineComponent,
  h,
  inject,
  onBeforeUnmount,
  ref,
  useId,
  watch,
  type App,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Image from "../layers/dms-ui/app/components/form/components/Image.vue";

const STORED_IMAGE = { key: "files/profile/cover.png", alt: "Cover" };

const passthrough = defineComponent({
  inheritAttrs: false,
  setup:
    (_, { slots }) =>
    () =>
      slots.default?.(),
});

function createImageApp(): App {
  const app = createSSRApp({
    render: () => h(Image, { modelValue: STORED_IMAGE }),
  });
  app.component("UButton", defineComponent({ setup: () => () => h("button") }));
  app.component("UIcon", defineComponent({ setup: () => () => h("span") }));
  app.component("UInput", defineComponent({ setup: () => () => h("input") }));
  app.component("UTooltip", passthrough);
  app.component("UModal", defineComponent({ setup: () => () => null }));
  return app;
}

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("useId", useId);
  vi.stubGlobal("onBeforeUnmount", onBeforeUnmount);
  vi.stubGlobal("FORM_FIELD_LOADING_KEY", Symbol());
  vi.stubGlobal("FORM_CONTENT_LANGUAGE_KEY", Symbol());
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "x-content-language");
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: () => new Promise(() => undefined),
  }));
  vi.stubGlobal("useUploadWithProgress", () => ({
    uploadWithProgress: vi.fn(),
  }));
  vi.stubGlobal("useFormField", () => ({ emitFormChange: vi.fn() }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal(
    "useDmsCookie",
    (_key: string, options: { default: () => unknown }) =>
      ref(options.default()),
  );
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("hydrates a stored single image without an attribute mismatch", async () => {
  const html = await renderToString(createImageApp());
  const container = document.createElement("div");
  container.innerHTML = html;
  const warnings: string[] = [];
  const app = createImageApp();
  app.config.warnHandler = (message) => warnings.push(message);
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  app.mount(container);

  expect(warnings.filter((message) => message.includes("Hydration"))).toEqual(
    [],
  );
  expect(consoleError).not.toHaveBeenCalledWith(
    expect.stringContaining("Hydration"),
  );
  const label = container.querySelector("label")!;
  expect(label.htmlFor).not.toBe("");
  expect(container.querySelector("input:not([type])")!.id).toBe(label.htmlFor);
  app.unmount();
  consoleError.mockRestore();
});
