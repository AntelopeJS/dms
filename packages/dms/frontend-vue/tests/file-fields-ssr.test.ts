/** @vitest-environment jsdom */
/**
 * The stored files of the file and image fields and of their table previews,
 * through the runtime's real async data: a server render reads their
 * metadata and renders the names and pictures, and the browser hydrates with
 * it without asking again.
 */
import {
  type App,
  type Component,
  computed,
  type FunctionalComponent,
  type VNode,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  onScopeDispose,
  ref,
  shallowReactive,
  useId,
  watch,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import File from "../layers/dms-ui/app/components/form/components/File.vue";
import Image from "../layers/dms-ui/app/components/form/components/Image.vue";
import FilePreview from "../layers/dms-ui/app/components/table-view/FilePreview.vue";
import ImagePreview from "../layers/dms-ui/app/components/table-view/ImagePreview.vue";
import { hydrate, serverRender, stubApiData } from "./helpers/api-data-runtime";

const METADATA = {
  "documents/brief.pdf": {
    resourceKey: "documents/brief.pdf",
    filename: "brief.pdf",
    size: 2048,
    mimetype: "application/pdf",
    url: "https://files.test/brief.pdf",
  },
  "covers/cover.png": {
    resourceKey: "covers/cover.png",
    filename: "cover.png",
    size: 4096,
    mimetype: "image/png",
    url: "https://files.test/cover.png",
  },
};

const metadataByKey = new Map(Object.entries(METADATA));

const authFetch = vi.fn(
  async (_url: string, options: { query: { resourceKey: string } }) =>
    metadataByKey.get(options.query.resourceKey),
);
const mounted: App[] = [];

const passthrough: FunctionalComponent = (_, { slots }) =>
  h("span", slots.default?.());
const renderTag =
  (tag: string): FunctionalComponent =>
  (props) =>
    h(tag, props.src ? { src: props.src } : {});

function register(app: App): void {
  app.config.globalProperties.$t = (key: string) => key;
  for (const name of ["UFileUpload", "ULink", "UTooltip"])
    app.component(name, passthrough);
  for (const name of ["UButton", "UIcon", "UInput"])
    app.component(name, renderTag("i"));
  app.component("UAvatar", renderTag("img"));
  app.component("UModal", () => null);
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
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "x-content-language");
  stubApiData(authFetch);
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
  vi.stubGlobal(
    "useDmsCookie",
    <Value>(_key: string, options: { default: () => Value }) =>
      ref(options.default()),
  );
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  authFetch.mockClear();
});

it.each<[string, Component, NonNullable<VNode["props"]>, string]>([
  ["a file field", File, { modelValue: "documents/brief.pdf" }, "brief.pdf"],
  [
    "an image field",
    Image,
    { modelValue: { key: "covers/cover.png", alt: "Cover" } },
    "https://files.test/cover.png",
  ],
  [
    "a table's file cell",
    FilePreview,
    { resourceKey: "documents/brief.pdf" },
    "brief.pdf",
  ],
  [
    "a table's image cell",
    ImagePreview,
    { images: [{ key: "covers/cover.png" }] },
    "https://files.test/cover.png",
  ],
])(
  "renders %s's stored file on the server, and the browser does not read it again",
  async (_name, component, props, shown) => {
    const root = { render: () => h(component, props) };
    vi.stubEnv("SSR", true);
    const { html, payload } = await serverRender(root, register);
    vi.stubEnv("SSR", false);
    expect(html).toContain(shown);
    expect(authFetch).toHaveBeenCalledTimes(1);

    authFetch.mockClear();
    const { app, container } = hydrate(root, html, payload, register);
    mounted.push(app);
    await nextTick();
    await new Promise((done) => setTimeout(done, 0));
    expect(authFetch).not.toHaveBeenCalled();
    expect(container.innerHTML).toContain(shown);
  },
);
