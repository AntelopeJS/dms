/** @vitest-environment jsdom */
/**
 * A URL shown read-only (a cell, a record's details) is a link, or, when its
 * `UrlType` asks for a `preview`, the image it points to: a remote photo
 * reads as a picture, not as its address.
 */
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { isObject, isString } from "../layers/dms-core/app/utils/type-check";

type Formatter = NonNullable<DataType["formatter"]>["default"];

const registered = new Map<string, DataType["formatter"]>();
const PHOTO = "https://i.pravatar.cc/150?img=47";

let app: App | undefined;

function renderUrl(
  value: Parameters<Formatter>[0],
  options: Parameters<Formatter>[2] = {},
  row?: Parameters<Formatter>[3],
): HTMLElement {
  const content = registered.get("url")!.default(value, "en", options, row);
  const container = document.createElement("div");
  app = createApp(defineComponent({ setup: () => () => content }));
  app.mount(container);
  return container;
}

beforeAll(async () => {
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
    const link = renderUrl(PHOTO).querySelector("a");
    expect(link?.getAttribute("href")).toBe(PHOTO);
  });

  it("is a round thumbnail with `preview: avatar`", () => {
    const cell = renderUrl(PHOTO, { preview: "avatar" });
    expect(cell.querySelector("img")?.getAttribute("src")).toBe(PHOTO);
    expect(cell.querySelector("a")).toBeNull();
  });

  it("is a framed image with `preview: image`", () => {
    const image = renderUrl(PHOTO, { preview: "image" }).querySelector("img");
    expect(image?.getAttribute("src")).toBe(PHOTO);
  });

  it("is named after its row, a team member's photo by the member", () => {
    const avatar = renderUrl(
      PHOTO,
      { preview: "avatar", fieldLabel: "Photo" },
      { name: "Jane Doe" },
    ).querySelector("img");
    expect(avatar?.getAttribute("alt")).toBe("Jane Doe");
    const image = renderUrl(
      PHOTO,
      { preview: "image" },
      { title: { en: "Roof", fr: "Toiture" } },
    ).querySelector("img");
    expect(image?.getAttribute("alt")).toBe("Roof");
  });

  it("is named after its field when its row has no name", () => {
    const image = renderUrl(
      PHOTO,
      { preview: "image", fieldLabel: "Photo" },
      { email: "jane@example.com" },
    ).querySelector("img");
    expect(image?.getAttribute("alt")).toBe("Photo");
  });

  it("stays empty with no URL to draw", () => {
    expect(
      renderUrl("", { preview: "avatar" }).querySelector("img"),
    ).toBeNull();
  });
});
