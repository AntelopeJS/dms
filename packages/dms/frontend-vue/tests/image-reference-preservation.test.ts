/** @vitest-environment jsdom */
import {
  computed,
  defineComponent,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  ref,
  useId,
  watch,
  type App,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Image from "../layers/dms-ui/app/components/form/components/Image.vue";
import { FORM_CONTENT_LANGUAGE_KEY } from "../layers/dms-ui/app/composables/form/types/content-language";
import {
  mountInBrowser,
  serverRender,
  stubApiData,
} from "./helpers/api-data-runtime";

interface ImageValue {
  key: string;
  alt?: string;
  principal?: boolean;
}

const emit = vi.fn();
const authFetch = vi.fn();
const upload = vi.fn();
const mounted: App[] = [];
const original: ImageValue = {
  key: "legacy/private.png",
  alt: "Original",
  principal: true,
};
const sibling: ImageValue = { key: "visible/sibling.png", alt: "Sibling" };

function registerUi(app: App) {
  app.component(
    "UButton",
    defineComponent({
      props: ["label", "icon"],
      setup: (props) => () =>
        h("button", { "aria-label": props.label || props.icon }, props.label),
    }),
  );
  app.component("UIcon", defineComponent({ setup: () => () => h("span") }));
  app.component(
    "UTooltip",
    defineComponent({
      props: ["text"],
      setup:
        (_, { slots }) =>
        () =>
          slots.default?.(),
    }),
  );
  app.component("UInput", defineComponent({ setup: () => () => h("input") }));
  app.component(
    "UTextarea",
    defineComponent({ setup: () => () => h("textarea") }),
  );
  app.component("UModal", defineComponent({ setup: () => () => null }));
}

function mountImage(values = [original, sibling]) {
  const model = ref(values);
  const { app, container } = mountInBrowser(
    {
      render: () =>
        h(Image, {
          modelValue: model.value,
          multiple: true,
          "onUpdate:modelValue": emit,
        }),
    },
    (app) => {
      registerUi(app);
      app.provide(FORM_CONTENT_LANGUAGE_KEY, "*");
    },
  );
  mounted.push(app);
  return { container, model };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const result = Array.from(container.querySelectorAll("button")).find(
    (element) => element.getAttribute("aria-label") === label,
  );
  if (!result) throw new Error(`Missing button ${label}`);
  return result;
}

const settle = async () => {
  for (let tick = 0; tick < 5; tick++) await nextTick();
  await new Promise((done) => setTimeout(done, 0));
};

beforeEach(() => {
  vi.stubEnv("SSR", false);
  authFetch.mockImplementation((_url, options) =>
    options.query?.resourceKey === original.key
      ? Promise.reject(
          Object.assign(new Error("Forbidden"), { statusCode: 403 }),
        )
      : Promise.resolve({
          url: "https://example.test/sibling.png",
          filename: "Sibling",
          size: 10,
        }),
  );
  for (const [name, value] of Object.entries({
    computed,
    inject,
    onBeforeUnmount,
    ref,
    useId,
    watch,
  })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "x-content-language");
  stubApiData(authFetch);
  vi.stubGlobal("useUploadWithProgress", () => ({
    uploadWithProgress: upload,
  }));
  vi.stubGlobal("useFormField", () => ({
    emitFormChange: vi.fn(),
    color: ref(undefined),
    ariaAttrs: ref(undefined),
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal(
    "useDmsCookie",
    <Value>(_key: string, options: { default: () => Value }) =>
      ref(options.default()),
  );
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:new-image");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

it("preserves a denied image when another image is removed", async () => {
  const { container } = mountImage();
  await settle();
  expect(container.textContent).toContain("dms.form.image.file_unavailable");
  button(container, "i-lucide-trash-2").click();
  expect(emit).toHaveBeenLastCalledWith([original]);
});

it("preserves a denied image on value echo without replacing its rendered tile", async () => {
  const { container, model } = mountImage();
  await settle();
  const tile = container.querySelector('[draggable="true"]');
  model.value = [{ ...original }, { ...sibling }];
  await nextTick();
  expect(container.querySelector('[draggable="true"]')).toBe(tile);
  expect(container.textContent).toContain("dms.form.image.file_unavailable");
  button(container, "i-lucide-star").click();
  expect(emit).toHaveBeenLastCalledWith([
    { ...original, principal: undefined },
    { ...sibling, principal: true },
  ]);
});

it("removes a denied reference only when explicitly removed", async () => {
  const { container } = mountImage();
  await settle();
  button(container, "dms.form.image.delete").click();
  expect(emit).toHaveBeenLastCalledWith([{ ...sibling, principal: true }]);
});

it("excludes a failed new upload while retaining existing references", async () => {
  const { container } = mountImage();
  await settle();
  authFetch.mockRejectedValueOnce(new Error("Upload failed"));
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement))
    throw new Error("Missing file input");
  Object.defineProperty(input, "files", {
    value: [new File(["bytes"], "new.png", { type: "image/png" })],
  });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await settle();
  expect(container.textContent).toContain("dms.form.image.upload_failed");
  expect(container.textContent).toContain("new.png");
  expect(upload).not.toHaveBeenCalled();
  button(container, "i-lucide-star").click();
  expect(emit).toHaveBeenLastCalledWith([
    { ...original, principal: undefined },
    { ...sibling, principal: true },
  ]);
});

it("keeps the denied image and its explicit deletion control in rendered markup", async () => {
  authFetch.mockRejectedValue(
    Object.assign(new Error("Forbidden"), { statusCode: 403 }),
  );
  vi.stubEnv("SSR", true);
  const { html } = await serverRender(
    {
      render: () =>
        h(Image, {
          modelValue: [original],
          multiple: true,
          "onUpdate:modelValue": emit,
        }),
    },
    registerUi,
  );
  expect(html).toContain("dms.form.image.file_unavailable");
  expect(html).not.toContain("dms.form.image.upload_failed");
  expect(html).toContain("dms.form.image.delete</button>");
  expect(emit).not.toHaveBeenCalled();
});

it("refreshes an expiring image preview and retries a transient failure", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  authFetch
    .mockReset()
    .mockResolvedValueOnce({
      url: "https://example.test/first.png",
      filename: "First",
      size: 10,
      expiresAt: Date.now() + 60000,
    })
    .mockRejectedValueOnce(new Error("temporary"))
    .mockResolvedValueOnce({
      url: "https://example.test/refreshed.png",
      filename: "Refreshed",
      size: 10,
      expiresAt: Date.now() + 60000,
    });
  const { container } = mountImage([original]);
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(55000);
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "https://example.test/first.png",
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "https://example.test/refreshed.png",
  );
  expect(authFetch.mock.calls[0]![1].headers).toEqual({
    "x-content-language": "*",
  });
});
