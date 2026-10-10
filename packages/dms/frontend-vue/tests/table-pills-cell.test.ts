// @vitest-environment jsdom
/**
 * The `pills` cell draws a list of strings and related rows as outline role
 * pills, and the pill items a server styles per row in their own tone and
 * variant.
 */
import { createApp, defineComponent, h, type App, type VNodeChild } from "vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

type Formatter = (
  value: unknown,
  locale: string,
  options?: unknown,
  row?: Record<string, unknown>,
) => VNodeChild;

const registered = new Map<string, DataType["formatter"]>();

// Auto-imports of the layer the default types are registered with.
function stubLayerGlobals() {
  vi.stubGlobal("h", h);
  vi.stubGlobal("isObject", isObject);
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
    processI18n: (text: string) => text.replace(/^\$/, "i18n:"),
  }));
  vi.stubGlobal("useDataTypes", () => ({
    registerDataType: (dataType: DataType) =>
      registered.set(dataType.id, dataType.formatter),
  }));
}

let app: App | undefined;

function renderPills(value: unknown, options: unknown = {}): HTMLElement {
  const content = (registered.get("pills")!.default as Formatter)(
    value,
    "en",
    options,
    {},
  );
  const container = document.createElement("div");
  app = createApp(defineComponent({ setup: () => () => content }));
  app.component("UIcon", defineComponent({ render: () => h("i") }));
  app.mount(container);
  return container;
}

const pillsOf = (cell: HTMLElement) =>
  [...cell.firstElementChild!.children].map((pill) => ({
    label: pill.textContent,
    className: pill.className,
  }));

beforeAll(async () => {
  stubLayerGlobals();
  const { registerDefaultDataTypes } = await import(
    "../layers/dms-ui/app/build/composables/data-types/registerDefaults"
  );
  registerDefaultDataTypes();
});

afterEach(() => {
  app?.unmount();
  app = undefined;
});

describe("pills cell", () => {
  it("draws strings and related rows as outline role pills, as before", () => {
    const strings = pillsOf(renderPills(["$roles.admin", "Billing"]));
    expect(strings.map((pill) => pill.label)).toEqual([
      "i18n:roles.admin",
      "Billing",
    ]);
    expect(strings[0]!.className).toContain("border-accented");
    app?.unmount();

    const rows = pillsOf(renderPills([{ _id: "r1", name: "Editor" }, "r2"]));
    expect(rows.map((pill) => pill.label)).toEqual(["Editor"]);
  });

  it("draws a pill item in its tone and variant, beside plain strings", () => {
    const pills = pillsOf(
      renderPills([
        { label: "EN", tone: "primary", variant: "soft" },
        { label: "DE", variant: "outline" },
        { label: "IT", tone: "success" },
        "ES",
      ]),
    );

    expect(pills.map((pill) => pill.label)).toEqual(["EN", "DE", "IT", "ES"]);
    expect(pills[0]!.className).toContain("text-primary");
    expect(pills[0]!.className).toContain("bg-(--dms-accent-tint)");
    expect(pills[1]!.className).toContain("border");
    expect(pills[1]!.className).toContain("bg-transparent");
    expect(pills[2]!.className).toContain("bg-success/12");
    expect(pills[3]!.className).toContain("border-accented");
  });

  it("draws a pill item without a tone nor a variant as a plain string", () => {
    const [pill] = pillsOf(renderPills([{ label: "FR" }]));
    expect(pill!.label).toBe("FR");
    expect(pill!.className).toContain("border-accented");
  });
});
