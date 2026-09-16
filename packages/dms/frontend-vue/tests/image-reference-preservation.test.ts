import { readFileSync } from "node:fs";
import { transpileModule } from "typescript";
import {
  computed,
  createSSRApp,
  defineComponent,
  effectScope,
  h,
  nextTick,
  onScopeDispose,
  onServerPrefetch,
  reactive,
  ref,
  watch,
  type EffectScope,
  type Ref,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Image from "../layers/dms-ui/app/components/form/components/Image.vue";

interface ImageValue {
  key: string;
  alt?: string;
  principal?: boolean;
}

interface GalleryEntry {
  id: string;
  key: string | null;
  status: string;
  alt: string;
  url: string;
  expiresAt?: number;
}

interface ImageHarness {
  items: Ref<GalleryEntry[]>;
  emitValue: () => void;
  removeItem: (id: string) => void;
  addFiles: (files: File[]) => void;
  fetchItemMetadata: (item: GalleryEntry, force?: boolean) => Promise<void>;
}

const emit = vi.fn();
const authFetch = vi.fn();
const upload = vi.fn();
let scope: EffectScope;
const props = reactive({ modelValue: [] as ImageValue[], multiple: true });
const original: ImageValue = {
  key: "legacy/private.png",
  alt: "Original",
  principal: true,
};
const sibling: ImageValue = { key: "visible/sibling.png", alt: "Sibling" };

function loadImage(): ImageHarness {
  const component = readFileSync(
    new URL(
      "../layers/dms-ui/app/components/form/components/Image.vue",
      import.meta.url,
    ),
    "utf8",
  );
  const script = component
    .split('<script setup lang="ts">')[1]!
    .split("</script>")[0]!;
  const source = script
    .replace(/^import[\s\S]*?from "[^"]+";\n/gm, "")
    .replaceAll("import.meta.env.SSR", "false")
    .replace(/^export type /gm, "type ");
  const { outputText } = transpileModule(source, {});
  return scope.run(() =>
    new Function(
      `${outputText}; return { items, emitValue, removeItem, addFiles, fetchItemMetadata };`,
    )(),
  )!;
}

beforeEach(() => {
  scope = effectScope();
  props.modelValue = [original, sibling];
  authFetch.mockImplementation((_url, options) =>
    options.query?.resourceKey === original.key
      ? Promise.reject(new Error("403"))
      : Promise.resolve({
          url: "https://example.test/sibling.png",
          filename: "Sibling",
          size: 10,
        }),
  );
  vi.stubGlobal("defineProps", () => props);
  vi.stubGlobal("defineEmits", () => emit);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("inject", () => null);
  vi.stubGlobal("FORM_FIELD_LOADING_KEY", Symbol());
  vi.stubGlobal("FORM_CONTENT_LANGUAGE_KEY", Symbol());
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "x-content-language");
  vi.stubGlobal("onBeforeUnmount", onScopeDispose);
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useUploadWithProgress", () => ({
    uploadWithProgress: upload,
  }));
  vi.stubGlobal("useFormField", () => ({ emitFormChange: vi.fn() }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
});

afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("preserves a denied image when another image is removed", async () => {
  const image = loadImage();
  await nextTick();
  expect(image.items.value[0]!.status).toBe("error");
  image.removeItem(image.items.value[1]!.id);
  expect(emit).toHaveBeenLastCalledWith("update:modelValue", [original]);
});

it("preserves a denied image on value echo without reinitializing its identity", async () => {
  const image = loadImage();
  await nextTick();
  const id = image.items.value[0]!.id;
  props.modelValue = [{ ...original }, { ...sibling }];
  await nextTick();
  expect(image.items.value[0]!.id).toBe(id);
  image.emitValue();
  expect(emit).toHaveBeenLastCalledWith("update:modelValue", [
    original,
    sibling,
  ]);
});

it("removes a denied reference only when explicitly removed", async () => {
  const image = loadImage();
  await nextTick();
  image.removeItem(image.items.value[0]!.id);
  expect(emit).toHaveBeenLastCalledWith("update:modelValue", [
    { ...sibling, principal: true },
  ]);
});

it("excludes a failed new upload while retaining existing references", async () => {
  const image = loadImage();
  await nextTick();
  authFetch.mockRejectedValueOnce(new Error("Upload failed"));
  image.addFiles([new File(["bytes"], "new.png", { type: "image/png" })]);
  await vi.waitFor(() =>
    expect(image.items.value.at(-1)!.status).toBe("error"),
  );
  expect(image.items.value.at(-1)!.key).toBeNull();
  image.emitValue();
  expect(emit).toHaveBeenLastCalledWith("update:modelValue", [
    original,
    sibling,
  ]);
});

it("keeps the denied image and its explicit deletion control in rendered markup", async () => {
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: () => {
      const denied = Promise.reject(new Error("403"));
      onServerPrefetch(() => denied.catch(() => undefined));
      return denied;
    },
  }));
  const app = createSSRApp({
    render: () => h(Image, { modelValue: [original], multiple: true }),
  });
  app.component(
    "UButton",
    defineComponent({
      props: ["label"],
      setup: (buttonProps) => () => h("button", buttonProps.label),
    }),
  );
  app.component("UIcon", defineComponent({ setup: () => () => h("span") }));
  app.component(
    "UTooltip",
    defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          slots.default?.(),
    }),
  );
  app.component("UModal", defineComponent({ setup: () => () => null }));
  const html = await renderToString(app);
  expect(html).toContain("dms.form.image.upload_failed");
  expect(html).toContain("dms.form.image.delete</button>");
  expect(emit).not.toHaveBeenCalled();
});

it("refreshes an expiring image preview and retries a transient failure", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
  const contentLanguageKey = Symbol();
  vi.stubGlobal("FORM_CONTENT_LANGUAGE_KEY", contentLanguageKey);
  vi.stubGlobal("inject", (key: symbol) =>
    key === contentLanguageKey ? "*" : null,
  );
  props.modelValue = [original];
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

  const image = loadImage();
  await nextTick();
  await vi.advanceTimersByTimeAsync(55000);
  expect(image.items.value[0]!.url).toBe("https://example.test/first.png");
  await vi.advanceTimersByTimeAsync(1000);
  expect(image.items.value[0]!.url).toBe("https://example.test/refreshed.png");
  expect(authFetch.mock.calls[0]![1].headers).toEqual({
    "x-content-language": "*",
  });
  vi.useRealTimers();
});
