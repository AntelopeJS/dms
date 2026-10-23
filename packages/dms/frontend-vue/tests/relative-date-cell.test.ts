// @vitest-environment jsdom
/**
 * The `relative_date` cell (`RelativeDateDisplay`): a browser hydrating a
 * server render measures "3 min ago" from the instant the server rendered
 * at, so a date on a minute's edge hydrates as the server wrote it, and a
 * later render follows the clock.
 */
import { defineComponent, h, type VNodeChild } from "vue";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { isObject } from "../layers/dms-core/app/utils/type-check";
import {
  engine,
  hydrate,
  mountInBrowser,
  serverRender,
} from "./helpers/api-data-runtime";

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
    "formatTimeSpan",
    "formatDate",
    "getBooleanLabel",
  ]) {
    vi.stubGlobal(name, () => "");
  }
  vi.stubGlobal("useDataTypes", () => ({ registerDataType: register }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: String }));
  // What getAppTranslation reads, outside a setup.
  vi.stubGlobal("useDmsApp", () => ({ $i18n: { t: String } }));
  vi.stubGlobal("useDmsState", engine.useDmsState);
  vi.stubGlobal("isDmsHydrating", engine.isDmsHydrating);
}

beforeAll(async () => {
  stubLayerGlobals();
  const { registerDefaultDataTypes } = await import(
    "../layers/dms-ui/app/build/composables/data-types/registerDefaults"
  );
  registerDefaultDataTypes();
});

afterEach(() => {
  vi.useRealTimers();
});

const DATE = new Date("2026-10-17T12:00:00Z");
const SECOND = 1000;
// 3 min 29 s reads "3 min. ago"; 3 min 31 s rounds to "4 min. ago".
const SERVER_AT = DATE.getTime() + 209 * SECOND;
const BROWSER_AT = DATE.getTime() + 211 * SECOND;

// As Table.vue draws it: the formatter's output is the cell's root.
const Cell = defineComponent({
  setup: () => () =>
    formatters.get("relative_date")!(
      DATE.toISOString(),
      "en-GB",
      {},
      {},
    ) as VNodeChild,
});
const Row = { render: () => h("div", [h(Cell)]) };

// A server has no `window`: what the layer reads to know where it renders.
async function renderOnServer() {
  const browserWindow = globalThis.window;
  vi.stubGlobal("window", undefined);
  try {
    return await serverRender(Row);
  } finally {
    vi.stubGlobal("window", browserWindow);
  }
}

describe("relative date cell", () => {
  it("hydrates the text the server measured, on a minute's edge", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: SERVER_AT });
    const { html, payload } = await renderOnServer();
    expect(html).toContain("3 min ago");

    vi.setSystemTime(BROWSER_AT);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, container } = hydrate(Row, html, payload);
    const mismatches = [...warn.mock.calls, ...error.mock.calls].filter(
      (call) => /hydration/i.test(String(call[0])),
    );
    warn.mockRestore();
    error.mockRestore();
    expect(mismatches).toEqual([]);
    expect(container.textContent).toBe("3 min ago");
    app.unmount();
  });

  it("follows the clock in a render that hydrates nothing", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: BROWSER_AT });
    const { app, container } = mountInBrowser(Row);
    expect(container.textContent).toBe("4 min ago");
    app.unmount();
  });
});

describe("relative date cell, day style", () => {
  const NOW = new Date("2026-10-17T12:00:00Z").getTime();
  const DayCell = (value: string) =>
    defineComponent({
      setup: () => () =>
        formatters.get("relative_date")!(
          value,
          "en-GB",
          { style: "day" },
          {},
        ) as VNodeChild,
    });
  const shown = (value: string) => {
    const { app, container } = mountInBrowser(DayCell(value));
    const text = container.textContent;
    app.unmount();
    return text;
  };

  it("names the year of a date in another year", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    expect(shown("2018-04-02T12:00:00Z")).toBe("2 Apr 2018");
    expect(shown("2027-01-05T12:00:00Z")).toBe("5 Jan 2027");
  });

  it("leaves the year out of a date this year", () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    expect(shown("2026-04-02T12:00:00Z")).toBe("2 Apr");
  });
});
