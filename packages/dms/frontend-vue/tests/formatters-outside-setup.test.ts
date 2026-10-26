/** @vitest-environment jsdom */
/**
 * A data-type formatter runs wherever a value is drawn — a footer summary, a
 * group header, a card field, a filter chip, an export — often with no
 * component setup active, where `useI18n()` throws ("Must be called at the
 * top of a `setup` function") and the page turns into the error page. Every
 * registered formatter must write its text through the application's
 * composer instead, in its active locale.
 */
import { createApp, defineComponent, h } from "vue";
import { createI18n, useI18n } from "vue-i18n";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { Size } from "../layers/dms-core/app/types/size";
import * as formatterUtils from "../layers/dms-core/app/utils/formatter";
import { parse } from "../layers/dms-core/app/utils/stringTypeParser";
import * as typeChecks from "../layers/dms-core/app/utils/type-check";
import coreEn from "../layers/dms-core/app/entries/i18n/locales/core-en-GB.json";
import coreFr from "../layers/dms-core/app/entries/i18n/locales/core-fr-FR.json";
import uiEn from "../layers/dms-ui/app/entries/i18n/locales/ui-en-GB.json";
import uiFr from "../layers/dms-ui/app/entries/i18n/locales/ui-fr-FR.json";

type Messages = import("vue-i18n").LocaleMessage<
  import("vue-i18n").VueMessageType
>;

const mergeMessages = (...sources: Messages[]): Messages =>
  sources.reduce<Messages>((merged, source) => {
    for (const [key, value] of Object.entries(source)) {
      const current = merged[key];
      merged[key] =
        typeChecks.isObject(current) && typeChecks.isObject(value)
          ? mergeMessages(current, value)
          : value;
    }
    return merged;
  }, {});

const i18n = createI18n({
  legacy: false,
  locale: "en-GB",
  fallbackLocale: "en-GB",
  missingWarn: false,
  fallbackWarn: false,
  messages: {
    "en-GB": mergeMessages(coreEn, uiEn),
    "fr-FR": mergeMessages(coreFr, uiFr),
  },
});

const dataTypes = new Map<string, DataType>();

function stubLayerGlobals() {
  vi.stubGlobal("h", h);
  for (const [name, value] of Object.entries({
    ...formatterUtils,
    ...typeChecks,
    parse,
    Size,
  })) {
    vi.stubGlobal(name, value);
  }
  vi.stubGlobal("useI18n", useI18n);
  vi.stubGlobal("useDmsApp", () => ({ $i18n: i18n.global }));
  vi.stubGlobal("useDataTypes", () => ({
    registerDataType: (dataType: DataType) =>
      dataTypes.set(dataType.id, dataType),
    getDataType: (id: string) => dataTypes.get(id),
  }));
}

const SAMPLE_VALUES: unknown[] = [
  undefined,
  null,
  "",
  "text",
  "$dms.date.undefined",
  "https://example.com/image.png",
  0,
  42.5,
  true,
  false,
  "2026-10-17T10:00:00.000Z",
  [],
  ["first", "second"],
  [{ _id: "a", name: "First" }],
  ["2026-10-01", "2026-10-31"],
  { start: "2026-10-01", end: undefined },
  { _id: "a", name: "First" },
  { key: "$dms.date.undefined", params: {} },
];

const SAMPLE_OPTIONS: unknown[] = [undefined, {}, { multiple: true }];

beforeAll(async () => {
  stubLayerGlobals();
  const { registerDefaultDataTypes } = await import(
    "../layers/dms-ui/app/entries/composables/data-types/registerDefaults"
  );
  registerDefaultDataTypes();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("data-type formatters outside a component setup", () => {
  it("registers the default types", () => {
    expect(dataTypes.size).toBeGreaterThan(20);
  });

  it("never throws, whatever the formatter and the value", () => {
    const failures: string[] = [];
    for (const [id, dataType] of dataTypes) {
      for (const [mode, format] of Object.entries(dataType.formatter ?? {})) {
        for (const value of SAMPLE_VALUES) {
          for (const options of SAMPLE_OPTIONS) {
            try {
              format(value, "en-GB", options, {});
            } catch (error) {
              failures.push(
                `${id}.${mode}(${JSON.stringify(value)}, ${JSON.stringify(options)}): ${String(error)}`,
              );
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("writes its texts in the application's active locale", () => {
    const date = dataTypes.get("date")!.formatter!;
    const count = dataTypes.get("array")!.formatter!.default;
    const english = date.default(undefined, "en-GB");
    const englishCount = count(["a", "b"], "en-GB");
    i18n.global.locale.value = "fr-FR";
    try {
      expect(date.default(undefined, "fr-FR")).not.toBe(english);
      expect(date.cell!(undefined, "fr-FR")).toBe(
        i18n.global.t("dms.date.undefined"),
      );
      expect(count(["a", "b"], "fr-FR")).not.toBe(englishCount);
    } finally {
      i18n.global.locale.value = "en-GB";
    }
  });
});

describe("a catalog-like table drawn after its setup", () => {
  const columns = {
    image: { accessorKey: "image", type: { id: "image" } },
    tags: { accessorKey: "tags", type: { id: "tags" } },
    stock: {
      accessorKey: "stock",
      type: { id: "number", inputComponent: { options: { suffix: " pcs" } } },
    },
    state: {
      accessorKey: "state",
      type: {
        id: "select",
        inputComponent: {
          options: { items: [{ label: "$dms.date.undefined", value: "a" }] },
        },
      },
    },
    family: {
      accessorKey: "family",
      type: { id: "cascader_relation", inputComponent: { options: {} } },
    },
    price: {
      accessorKey: "price",
      type: { id: "price" },
      display: { type: "two_line", options: { subField: "unit" } },
    },
    released: { accessorKey: "released", type: { id: "date" } },
    files: {
      accessorKey: "files",
      type: { id: "file", inputComponent: { options: { multiple: true } } },
    },
    description: { accessorKey: "description", type: { id: "rich_text" } },
  };
  const row = {
    image: "https://example.com/product.png",
    tags: ["solar", "home"],
    stock: 12,
    state: "a",
    family: [{ _id: "f1", name: "Panels" }],
    price: 1499.9,
    unit: { key: "$dms.date.undefined", params: {} },
    released: undefined,
    files: ["a.pdf", "b.pdf"],
    description: { en: "<p>Panel</p>", fr: "<p>Panneau</p>" },
  };

  it("renders every column of a row with no setup active", async () => {
    const { useColumnValueRenderer } = await import(
      "../layers/dms-ui/app/entries/composables/data-types/useColumnValueRenderer"
    );
    let renderer: ReturnType<typeof useColumnValueRenderer> | undefined;
    const app = createApp(
      defineComponent({
        setup() {
          renderer = useColumnValueRenderer();
          return () => null;
        },
      }),
    );
    app.use(i18n);
    app.mount(document.createElement("div"));
    try {
      for (const column of Object.values(columns)) {
        expect(() => renderer!.renderColumnValue(column, row)).not.toThrow();
        expect(() =>
          renderer!.renderColumnValue(column, row, "detail"),
        ).not.toThrow();
      }

      expect(() =>
        renderer!.renderValue(columns.price, 9999, undefined),
      ).not.toThrow();
    } finally {
      app.unmount();
    }
  });
});
