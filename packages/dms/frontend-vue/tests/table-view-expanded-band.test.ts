// @vitest-environment jsdom
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExpandedRowDetail from "../layers/dms-ui/app/components/table-view/ExpandedRowDetail.vue";
import type {
  TableViewColumn,
  TableViewExpandableConfig,
} from "../layers/dms-ui/app/composables/table-view/types";

vi.mock(
  "../layers/dms-ui/app/components/key-value-list/KeyValueList.vue",
  async () => {
    const { defineComponent: define, h: render } = await import("vue");
    return {
      default: define({
        props: { items: Array },
        setup: (props) => () =>
          render(
            "dl",
            (props.items as Array<{ label: string }>).map((item) =>
              render("dt", item.label),
            ),
          ),
      }),
    };
  },
);

const OrderLines = defineComponent({
  props: { row: Object, rowId: String },
  setup: (props) => () =>
    h("div", { "data-lines": props.rowId }, String(props.row?.number)),
});

const columns = [
  { id: "carrier", accessorKey: "carrier", header: "Carrier" },
] as unknown as TableViewColumn[];

describe("TableView expanded row band", () => {
  let app: App | undefined;

  const mount = (config: TableViewExpandableConfig) => {
    app = createApp({
      render: () =>
        h(ExpandedRowDetail, {
          row: { number: "A-1", carrier: "UPS" },
          rowId: "a1",
          columns,
          config,
        }),
    });
    const container = document.createElement("div");
    app.mount(container);
    return container;
  };

  beforeEach(() => {
    vi.stubGlobal("useTranslation", () => ({
      processI18n: (text: string) => text,
    }));
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
    vi.stubGlobal("useI18n", () => ({ locale: { value: "en" } }));
    vi.stubGlobal("resolveDmsComponent", (name: string) =>
      name === "OrderLines" ? OrderLines : undefined,
    );
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("hands the whole band to the component", () => {
    const container = mount({
      component: { componentName: "OrderLines" },
      fields: [{ key: "carrier" }],
    } as TableViewExpandableConfig);
    expect(container.querySelector("[data-lines='a1']")?.textContent).toBe(
      "A-1",
    );
    expect(container.querySelector("dl")).toBeNull();
  });

  it("lists the fields without a component", () => {
    const container = mount({ fields: [{ key: "carrier" }] });
    expect(container.querySelector("[data-lines]")).toBeNull();
    expect(container.querySelector("dt")?.textContent).toBe("Carrier");
  });
});
