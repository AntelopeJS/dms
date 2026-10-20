// @vitest-environment jsdom
/**
 * A URL shown read-only (a cell, a record's details) is a link, or, when its
 * `UrlType` asks for a `preview`, the image it points to: a remote photo
 * reads as a picture, not as its address.
 */
import { createApp, defineComponent, h, type App, type VNodeChild } from "vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { isObject, isString } from "../layers/dms-core/app/utils/type-check";

const named = (name: string) => ({
  default: defineComponent({
    inheritAttrs: false,
    props: { src: String, to: String },
    setup: (props) => () =>
      h("span", { "data-stub": name, "data-src": props.src ?? props.to }),
  }),
});
vi.mock("@nuxt/ui/components/Avatar.vue", () => named("avatar"));
vi.mock("@nuxt/ui/components/Badge.vue", () => named("badge"));
vi.mock("@nuxt/ui/components/Link.vue", () => named("link"));
vi.mock("@nuxt/ui/runtime/vue/components/Icon.vue", () => named("icon"));
vi.mock("../layers/dms-ui/app/composables/useFileReadUrls", () => ({
  useFileReadUrls: () => ({ getUrl: () => undefined, resolve: () => {} }),
}));

type Formatter = (
  value: unknown,
  locale: string,
  options?: unknown,
) => VNodeChild;

const registered = new Map<string, DataType["formatter"]>();
const PHOTO = "https://i.pravatar.cc/150?img=47";

let app: App | undefined;

function renderUrl(value: unknown, options: unknown = {}): HTMLElement {
  const content = (registered.get("url")!.default as Formatter)(
    value,
    "en",
    options,
  );
  const container = document.createElement("div");
  app = createApp(defineComponent({ setup: () => () => content }));
  app.mount(container);
  return container;
}

beforeAll(async () => {
  // Auto-imports of the layer the default types are registered with.
  vi.stubGlobal("h", h);
  vi.stubGlobal("isObject", isObject);
  vi.stubGlobal("isString", isString);
  for (const name of [
    "formatNumber",
    "formatPrice",
    "formatPercentage",
    "formatTimeSpan",
    "formatDate",
    "getBooleanLabel",
  ]) {
    vi.stubGlobal(name, () => "");
  }
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  vi.stubGlobal("useDataTypes", () => ({
    registerDataType: (dataType: DataType) =>
      registered.set(dataType.id, dataType.formatter),
  }));
  const { registerDefaultDataTypes } = await import(
    "../layers/dms-ui/app/build/composables/data-types/registerDefaults"
  );
  registerDefaultDataTypes();
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("a URL shown read-only", () => {
  it("is a link by default", () => {
    const link = renderUrl(PHOTO).querySelector("[data-stub=link]");
    expect(link?.getAttribute("data-src")).toBe(PHOTO);
  });

  it("is a round thumbnail with `preview: avatar`", () => {
    const cell = renderUrl(PHOTO, { preview: "avatar" });
    expect(
      cell.querySelector("[data-stub=avatar]")?.getAttribute("data-src"),
    ).toBe(PHOTO);
    expect(cell.querySelector("[data-stub=link]")).toBeNull();
  });

  it("is a framed image with `preview: image`", () => {
    const image = renderUrl(PHOTO, { preview: "image" }).querySelector("img");
    expect(image?.getAttribute("src")).toBe(PHOTO);
    expect(image?.getAttribute("alt")).toBe("");
  });

  it("stays empty with no URL to draw", () => {
    expect(
      renderUrl("", { preview: "avatar" }).querySelector("img"),
    ).toBeNull();
  });
});
