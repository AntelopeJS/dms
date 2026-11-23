/** @vitest-environment jsdom */
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DataType } from "../layers/dms-core/app/composables/data-types/useDataType";
import { Color } from "../layers/dms-core/app/types/color";
import { registerMetricCellTypes } from "../layers/dms-ui/app/entries/composables/data-types/metricCells";
import { defined } from "./helpers/defined";

type DataTypeFormatter = NonNullable<DataType["formatter"]>["default"];

const formatters = new Map<string, DataTypeFormatter>();
registerMetricCellTypes((dataType: DataType) => {
  formatters.set(dataType.id, defined(dataType.formatter).default);
});

let app: App | undefined;

const render = (content: ReturnType<DataTypeFormatter>): string => {
  const container = document.createElement("div");
  app = createApp(defineComponent({ setup: () => () => content }));
  app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
  app.mount(container);
  const html = container.innerHTML;
  app.unmount();
  return html;
};

beforeEach(() => {
  vi.stubGlobal("Color", Color);
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsApp", () => ({
    $i18n: { t: (key: string) => `i18n:${key}`, locale: { value: "en-GB" } },
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("tones a status pill by its select item when the column's map has no tone for the value", () => {
  const options = {
    tones: { failing: "error" },
    typeOptions: {
      items: [
        { value: "failing", label: "Failing", textColor: "info" },
        { value: "healthy", label: "Healthy", textColor: "success" },
        { value: "paused", label: "Paused", iconColor: "warning" },
        { value: "idle", label: "Idle" },
      ],
    },
  };
  const pill = (value: string) =>
    render(defined(formatters.get("status_pill"))(value, "en-GB", options, {}));

  expect(pill("healthy")).toContain("text-success");
  expect(pill("paused")).toContain("text-warning");
  expect(pill("failing")).toContain("text-error");
  expect(pill("idle")).not.toMatch(/text-(success|warning|error|info)/);
});
