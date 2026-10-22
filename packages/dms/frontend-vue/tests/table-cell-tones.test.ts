// @vitest-environment jsdom
/**
 * A `duration` and a plain text (`string`) cell take the colour of the tone a
 * row field holds (`toneField`), as text and never as a pill; a row without
 * one keeps the default look. A duration may also be written in milliseconds
 * whatever its size (`format: "ms"`).
 */
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  type App,
  type VNodeChild,
} from "vue";
import { renderToString } from "vue/server-renderer";
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
) => unknown;

let formatMilliseconds: (ms: number, locale: string) => string;

const formatters = new Map<string, Formatter>();
const register = (dataType: DataType) =>
  formatters.set(dataType.id, dataType.formatter?.default as Formatter);

// Auto-imports of the layer the default types are registered with.
function stubLayerGlobals() {
  vi.stubGlobal("h", h);
  vi.stubGlobal("isObject", isObject);
  for (const name of [
    "formatNumber",
    "formatPrice",
    "formatPercentage",
    "formatDate",
    "getBooleanLabel",
  ]) {
    vi.stubGlobal(name, () => "");
  }
  vi.stubGlobal("useDataTypes", () => ({ registerDataType: register }));
}

beforeAll(async () => {
  stubLayerGlobals();
  const { registerDefaultDataTypes } = await import(
    "../layers/dms-ui/app/build/composables/data-types/registerDefaults"
  );
  registerDefaultDataTypes();
  ({ formatMilliseconds } = await import(
    "../layers/dms-ui/app/build/composables/data-types/metricCells"
  ));
});

let app: App | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
});

function render(content: unknown): HTMLElement {
  const container = document.createElement("div");
  app = createApp(
    defineComponent({ setup: () => () => content as VNodeChild }),
  );
  app.mount(container);
  return container;
}

const cell = (
  id: string,
  value: unknown,
  options: unknown,
  row: Record<string, unknown> = {},
) => formatters.get(id)!(value, "en-GB", options, row);

describe("milliseconds format", () => {
  it("writes every duration in milliseconds, its digits grouped", () => {
    expect(formatMilliseconds(2149, "en-GB")).toBe("2,149 ms");
    expect(formatMilliseconds(2149, "fr-FR")).toBe("2 149 ms");
    expect(formatMilliseconds(2149, "es-ES")).toBe("2.149 ms");
    expect(formatMilliseconds(910.4, "en-GB")).toBe("910 ms");
    expect(formatMilliseconds(125_000, "en-GB")).toBe("125,000 ms");
  });
});

describe("duration cell", () => {
  it("rounds the duration by default, in milliseconds with format ms", () => {
    expect(render(cell("duration", 2149, {})).textContent).toBe("2.1 s");
    app?.unmount();
    expect(render(cell("duration", 2149, { format: "ms" })).textContent).toBe(
      "2,149 ms",
    );
    app?.unmount();
    expect(
      render(cell("duration", 2.149, { unit: "s", format: "ms" })).textContent,
    ).toBe("2,149 ms");
  });

  it("colours the figure in the row's tone, without a pill", () => {
    const figure = render(
      cell(
        "duration",
        2149,
        { toneField: "durationTone" },
        { durationTone: "warning" },
      ),
    ).firstElementChild!;
    expect(figure.className).toContain("text-warning");
    expect(figure.className).not.toContain("text-toned");
    expect(figure.className).not.toMatch(/bg-|rounded/);
  });

  it("keeps today's colour for a row whose field holds no tone", () => {
    for (const row of [{}, { durationTone: null }, { durationTone: "slow" }]) {
      const figure = render(
        cell("duration", 120, { toneField: "durationTone" }, row),
      ).firstElementChild!;
      expect(figure.className).toContain("text-toned");
      expect(figure.className).not.toContain("text-warning");
      app?.unmount();
    }
  });
});

describe("plain text cell", () => {
  it("draws the bare value without a tone field, as a string column did", () => {
    expect(cell("string", "Timeout", undefined)).toBe("Timeout");
    expect(cell("string", "Timeout", {}, { messageTone: "error" })).toBe(
      "Timeout",
    );
  });

  it("keeps the bare value for a row whose field holds no tone", () => {
    const options = { toneField: "messageTone" };
    expect(cell("string", "OK", options, {})).toBe("OK");
    expect(cell("string", "OK", options, { messageTone: "red" })).toBe("OK");
  });

  it("colours the text in the row's tone, without a pill", () => {
    const text = render(
      cell(
        "string",
        "ECONNRESET",
        { toneField: "messageTone" },
        { messageTone: "error" },
      ),
    ).firstElementChild!;
    expect(text.textContent).toBe("ECONNRESET");
    expect(text.className).toBe("text-error");
  });

  it("renders a non-string value as the untoned cell does, only adding the tone", () => {
    const options = { toneField: "messageTone" };
    for (const value of [2149, ["a", "b"], 0]) {
      const plain = render(cell("string", value, options, {})).textContent;
      app?.unmount();
      const toned = render(
        cell("string", value, options, { messageTone: "error" }),
      ).firstElementChild!;
      expect(toned.textContent).toBe(plain);
      expect(toned.textContent).not.toContain("[object");
      expect(toned.className).toBe("text-error");
      app?.unmount();
    }
  });
});

describe("empty plain text cell", () => {
  it("renders nothing, with or without a tone field", () => {
    expect(cell("string", "", undefined)).toBeNull();
    expect(
      cell("string", "", { toneField: "messageTone" }, { messageTone: "ok" }),
    ).toBeNull();
  });

  it("hydrates the server's HTML without a mismatch", async () => {
    // As Table.vue draws it: the formatter's output is the cell's root.
    const Cell = defineComponent({
      setup: () => () => cell("string", "", undefined) as VNodeChild,
    });
    const Row = { render: () => h("div", [h("b", "id"), h(Cell)]) };
    const container = document.createElement("div");
    container.innerHTML = await renderToString(createSSRApp(Row));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    app = createSSRApp(Row);
    app.mount(container);
    const mismatches = warn.mock.calls.filter((call) =>
      /hydration/i.test(String(call[0])),
    );
    warn.mockRestore();
    expect(mismatches).toEqual([]);
  });
});
