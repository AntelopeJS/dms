/** @vitest-environment jsdom */
import "./helpers/table-runtime";
import { computed, createApp, defineComponent, h, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardsDisplay from "../layers/dms-ui/app/entries/components/table-view/CardsDisplay";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types/column";
import type { TableViewCardConfig } from "../layers/dms-ui/app/composables/table-view/types/display";
import type { DataTypeFormatter } from "../layers/dms-core/app/composables/data-types/useDataType";
import { displayContext } from "./fixtures/displayContext";
import { tableViewColumn } from "./fixtures/tableViewColumn";

const column = (
  accessorKey: string,
  typeId: string,
  display?: TableViewColumn["display"],
) => tableViewColumn(accessorKey, { display }, typeId);

const formatter = (typeId: string) => ({
  default: (
    value: Parameters<DataTypeFormatter>[0],
    _locale: string,
    options: Parameters<DataTypeFormatter>[2],
    row?: Parameters<DataTypeFormatter>[3],
  ) =>
    `${typeId}(${String(value)}|${JSON.stringify(options ?? {})}|${String(row?._id)})`,
  empty: (
    _value: Parameters<DataTypeFormatter>[0],
    _locale: string,
    _options: Parameters<DataTypeFormatter>[2],
    row?: Parameters<DataTypeFormatter>[3],
  ) => `${typeId}-empty(${String(row?._id)})`,
});

let app: App | undefined;

function mountCards(columns: TableViewColumn[], card?: TableViewCardConfig) {
  const context = displayContext<Record<string, unknown>>({
    items: [{ _id: "team-05", name: "Platform", lead: "ada.png", done: 3 }],
    columns,
    labelKey: "name",
    options: { card },
    pagination: { total: 1 },
  });
  app = createApp({ render: () => h(CardsDisplay, { context }) });
  app.component("UCheckbox", defineComponent({ render: () => h("input") }));
  app.component("UIcon", defineComponent({ render: () => h("i") }));
  app.component("DmsEyebrowLabel", defineComponent({ render: () => h("dt") }));
  const container = document.createElement("div");
  app.mount(container);
  return container;
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("h", h);
  vi.stubGlobal("useI18n", () => ({ locale: ref("en"), t: (t: string) => t }));
  vi.stubGlobal("useTranslation", () => ({ processI18n: (t: string) => t }));
  vi.stubGlobal("useDataTypes", () => ({
    getDataType: (id: string) => ({ formatter: formatter(id) }),
  }));
  vi.stubGlobal("resolveDmsComponent", () => undefined);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("the cards display", () => {
  it("draws a field through its column's display, handed the row", () => {
    const progress = {
      type: "progress",
      options: { doneField: "done", totalField: "total" },
    };
    const container = mountCards(
      [column("name", "string"), column("progress", "number", progress)],
      { fields: ["progress"] },
    );
    expect(container.querySelector("dd")!.textContent).toBe(
      "progress-empty(team-05)",
    );
  });
});
