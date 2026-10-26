/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  defineComponent,
  h,
  inject,
  onScopeDispose,
  ref,
  watch,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import File from "../layers/dms-ui/app/components/form/components/File.vue";

const dropZone = defineComponent({
  inheritAttrs: false,
  setup:
    (_, { attrs }) =>
    () =>
      h("span", String(attrs.label ?? "")),
});

function mountFile(multiple: boolean) {
  const app = createApp({
    render: () => h(File, { modelValue: null, multiple }),
  });
  app.config.globalProperties.$t = (key: string) => key;
  app.component("UFileUpload", dropZone);
  const container = document.createElement("div");
  app.mount(container);
  return { app, container };
}

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("onScopeDispose", onScopeDispose);
  vi.stubGlobal("FORM_FIELD_LOADING_KEY", Symbol());
  vi.stubGlobal("FORM_CONTENT_LANGUAGE_KEY", Symbol());
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "x-content-language");
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("useUploadWithProgress", () => ({
    uploadWithProgress: vi.fn(),
  }));
  vi.stubGlobal("useFormField", () => ({
    emitFormChange: vi.fn(),
    color: ref(undefined),
    highlight: ref(undefined),
    ariaAttrs: ref(undefined),
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("asks for a file in its drop zone", () => {
  const { app, container } = mountFile(false);
  expect(container.textContent).toBe("dms.form.file.drop_prompt");
  app.unmount();
});

it("asks for files in the drop zone of a multiple field", () => {
  const { app, container } = mountFile(true);
  expect(container.textContent).toBe("dms.form.file.drop_prompt_multiple");
  app.unmount();
});
