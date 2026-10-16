// @vitest-environment jsdom
import {
  computed,
  defineComponent,
  h,
  inject,
  onBeforeUnmount,
  onScopeDispose,
  ref,
  shallowReactive,
  useId,
  watch,
  type App,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Image from "../layers/dms-ui/app/components/form/components/Image.vue";
import { hydrate, serverRender, stubApiData } from "./helpers/api-data-runtime";

const STORED_IMAGE = { key: "files/profile/cover.png", alt: "Cover" };

const passthrough = defineComponent({
  inheritAttrs: false,
  setup:
    (_, { slots }) =>
    () =>
      slots.default?.(),
});

const Root = { render: () => h(Image, { modelValue: STORED_IMAGE }) };

function register(app: App): void {
  app.component("UButton", defineComponent({ setup: () => () => h("button") }));
  app.component("UIcon", defineComponent({ setup: () => () => h("span") }));
  app.component("UInput", defineComponent({ setup: () => () => h("input") }));
  app.component("UTooltip", passthrough);
  app.component("UModal", defineComponent({ setup: () => () => null }));
}

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("useId", useId);
  vi.stubGlobal("onBeforeUnmount", onBeforeUnmount);
  vi.stubGlobal("onScopeDispose", onScopeDispose);
  vi.stubGlobal("shallowReactive", shallowReactive);
  vi.stubGlobal("FORM_FIELD_LOADING_KEY", Symbol());
  vi.stubGlobal("FORM_CONTENT_LANGUAGE_KEY", Symbol());
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "x-content-language");
  stubApiData((async () => ({
    resourceKey: STORED_IMAGE.key,
    filename: "cover.png",
    size: 10,
    url: "https://files.test/cover.png",
  })) as never);
  vi.stubGlobal("useUploadWithProgress", () => ({
    uploadWithProgress: vi.fn(),
  }));
  vi.stubGlobal("useFormField", () => ({
    emitFormChange: vi.fn(),
    color: ref(undefined),
    ariaAttrs: ref(undefined),
  }));
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
  vi.stubEnv("SSR", true);
  const { html, payload } = await serverRender(Root, register);
  vi.unstubAllEnvs();
  const warnings: string[] = [];
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  const { app, container } = hydrate(Root, html, payload, (application) => {
    register(application);
    application.config.warnHandler = (message) => warnings.push(message);
  });

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
