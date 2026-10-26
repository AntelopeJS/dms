/** @vitest-environment jsdom */
import "./helpers/table-runtime";
import { computed, createApp, defineComponent, h, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardsDisplay from "../layers/dms-ui/app/build/components/table-view/CardsDisplay.vue";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types/column";
import type {
  TableViewCardConfig,
  TableViewDisplayContext,
} from "../layers/dms-ui/app/composables/table-view/types/display";

type Row = Record<string, unknown>;

const column = (
  accessorKey: string,
  typeId: string,
  display?: TableViewColumn["display"],
) =>
  ({
    id: accessorKey,
    accessorKey,
    header: accessorKey,
    listable: true,
    type: { id: typeId },
    display,
  }) as unknown as TableViewColumn;

const formatter = (typeId: string) => ({
  default: (value: unknown, _locale: string, options: unknown, row?: Row) =>
    `${typeId}(${String(value)}|${JSON.stringify(options ?? {})}|${String(row?._id)})`,
  empty: (_value: unknown, _locale: string, _options: unknown, row?: Row) =>
    `${typeId}-empty(${String(row?._id)})`,
});

let app: App | undefined;

function mountCards(columns: TableViewColumn[], card?: TableViewCardConfig) {
  const context = {
    items: [{ _id: "team-05", name: "Platform", lead: "ada.png", done: 3 }],
    columns,
    loading: false,
    rowIdKey: "_id",
    labelKey: "name",
    options: { card },
    pagination: { pageIndex: 0, pageSize: 10, total: 1 },
    selection: { isSelected: () => false, toggle: () => undefined },
    actions: { canAdd: false, open: () => undefined },
  } as unknown as TableViewDisplayContext<Row>;
  app = createApp({ render: () => h(CardsDisplay, { context }) });
  app.component("UCheckbox", defineComponent({ render: () => h("input") }));
  app.component("UIcon", defineComponent({ render: () => h("i") }));
  app.component("DmsEyebrow", defineComponent({ render: () => h("dt") }));
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
