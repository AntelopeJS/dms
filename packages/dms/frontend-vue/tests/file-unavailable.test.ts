// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  inject,
  onScopeDispose,
  ref,
  watch,
  type App,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import File from "../layers/dms-ui/app/components/form/components/File.vue";

const STORED_KEY = "files/profile/avatar.pdf";
const authFetch = vi.fn();

const passthrough = defineComponent({
  inheritAttrs: false,
  setup:
    (_, { slots }) =>
    () =>
      h("span", slots.default?.()),
});

function mountFile(): { app: App; container: HTMLElement } {
  const app = createApp({
    render: () => h(File, { modelValue: STORED_KEY }),
  });
  app.config.globalProperties.$t = (key: string) => key;
  app.component("UFileUpload", passthrough);
  app.component("ULink", passthrough);
  app.component("UButton", defineComponent({ setup: () => () => h("button") }));
  app.component(
    "UIcon",
    defineComponent({
      props: ["name"],
      setup: (props) => () => h("i", { "data-icon": props.name }),
    }),
  );
  const container = document.createElement("div");
  app.mount(container);
  return { app, container };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("inject", inject);
  vi.stubGlobal("onScopeDispose", onScopeDispose);
  vi.stubGlobal("FORM_FIELD_LOADING_KEY", Symbol());
  vi.stubGlobal("FORM_CONTENT_LANGUAGE_KEY", Symbol());
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "x-content-language");
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useUploadWithProgress", () => ({
    uploadWithProgress: vi.fn(),
  }));
  vi.stubGlobal("useFormField", () => ({ emitFormChange: vi.fn() }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("marks a stored file whose metadata cannot be read as unavailable", async () => {
  authFetch.mockRejectedValue(new Error("404"));
  const { app, container } = mountFile();
  await vi.advanceTimersByTimeAsync(0);

  expect(container.textContent).toContain("dms.form.file.file_unavailable");
  expect(
    container.querySelector('[data-icon="i-lucide-file-check"]'),
  ).toBeNull();
  expect(
    container.querySelector('[data-icon="i-lucide-alert-circle"]'),
  ).not.toBeNull();
  app.unmount();
});

it("clears the unavailable state once a retry reads the file", async () => {
  authFetch.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce({
    resourceKey: STORED_KEY,
    filename: "avatar.pdf",
    size: 2048,
    mimetype: "application/pdf",
    url: "https://example.test/avatar.pdf",
  });
  const { app, container } = mountFile();
  await vi.advanceTimersByTimeAsync(0);
  expect(container.textContent).toContain("dms.form.file.file_unavailable");

  await vi.advanceTimersByTimeAsync(1000);

  expect(container.textContent).not.toContain("dms.form.file.file_unavailable");
  expect(container.textContent).toContain("avatar.pdf");
  expect(
    container.querySelector('[data-icon="i-lucide-file-check"]'),
  ).not.toBeNull();
  app.unmount();
});
