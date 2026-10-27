// @vitest-environment jsdom
/**
 * A relation cell whose joined row has no label shows the row's key, never
 * the row itself stringified (`[object Object]`).
 */
import { h } from "vue";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { isObject } from "../layers/dms-core/app/utils/type-check";

const stub = { default: { render: () => null } };
vi.mock("@nuxt/ui/components/Avatar.vue", () => stub);
vi.mock("@nuxt/ui/components/Badge.vue", () => stub);
vi.mock("@nuxt/ui/components/Link.vue", () => stub);
vi.mock("@nuxt/ui/runtime/vue/components/Icon.vue", () => stub);
vi.mock("../layers/dms-ui/app/composables/useFileReadUrls", () => ({
  useFileReadUrls: () => ({ getUrl: () => undefined, resolve: () => {} }),
}));

type Formatter = (value: unknown, locale: string, options: unknown) => unknown;

const formatters = new Map<string, Formatter>();
const register = (dataType: DataType) =>
  formatters.set(dataType.id, dataType.formatter?.default as Formatter);

beforeAll(async () => {
  vi.stubGlobal("h", h);
  vi.stubGlobal("isObject", isObject);
  for (const name of ["formatNumber", "formatPrice", "formatPercentage"]) {
    vi.stubGlobal(name, () => "");
  }
  vi.stubGlobal("useDataTypes", () => ({ registerDataType: register }));
  const { registerDefaultDataTypes } = await import(
    "../layers/dms-ui/app/build/composables/data-types/registerDefaults"
  );
  registerDefaultDataTypes();
});

const renderRelation = (value: unknown, options: unknown) =>
  formatters.get("relation")!(value, "en-GB", options);

describe("relation cell without a label", () => {
  const options = { keyMapping: { label: "id", value: "_id" } };

  it("shows the row's key when the label is empty", () => {
    expect(renderRelation({ _id: "ord-7", id: "" }, options)).toBe("ord-7");
  });

  it("shows the row's key when the label is null", () => {
    expect(renderRelation({ _id: "ord-7", id: null }, options)).toBe("ord-7");
  });

  it("reads the key from the default value key when none is mapped", () => {
    expect(renderRelation({ _id: "emp-3", name: null }, {})).toBe("emp-3");
  });

  it("keeps the label when there is one", () => {
    expect(renderRelation({ _id: "ord-7", id: 1042 }, options)).toBe(1042);
  });
});
