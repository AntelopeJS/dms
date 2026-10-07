// @vitest-environment jsdom
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExpandedRowDetail from "../layers/dms-ui/app/build/components/table-view/ExpandedRowDetail.vue";
import type {
  TableViewColumn,
  TableViewDisplayActions,
  TableViewExpandableConfig,
} from "../layers/dms-ui/app/composables/table-view/types";
import type { ExpandedRowLoadState } from "../layers/dms-ui/app/build/composables/table-view/useExpandedRowDetails";

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
  props: { row: Object, rowId: String, refresh: Function, open: Function },
  setup: (props) => () =>
    h(
      "button",
      { "data-lines": props.rowId, onClick: () => props.refresh?.() },
      String(props.row?.number),
    ),
});

const refresh = vi.fn();

const columns = [
  { id: "carrier", accessorKey: "carrier", header: "Carrier" },
] as unknown as TableViewColumn[];

describe("TableView expanded row band", () => {
  let app: App | undefined;

  const mount = (
    config: TableViewExpandableConfig,
    loadState: ExpandedRowLoadState = "ready",
    onRetry = () => {},
  ) => {
    app = createApp({
      render: () =>
        h(ExpandedRowDetail, {
          rowProps: {
            row: { number: "A-1", carrier: "UPS" },
            rowId: "a1",
            columns,
            actions: {} as TableViewDisplayActions<Record<string, unknown>>,
            open: () => {},
            refresh,
          },
          config,
          loadState,
          onRetry,
        }),
    });
    for (const name of ["USkeleton", "UIcon"]) {
      app.component(name, defineComponent({ render: () => h("span") }));
    }
    app.component(
      "UButton",
      defineComponent({
        props: { label: String },
        setup: (props) => () => h("button", { "data-retry": "" }, props.label),
      }),
    );
    const container = document.createElement("div");
    app.mount(container);
    return container;
  };

  beforeEach(() => {
    vi.stubGlobal("useTranslation", () => ({
      processI18n: (text: string) => text,
    }));
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
    vi.stubGlobal("useI18n", () => ({
      locale: { value: "en" },
      t: (key: string) => key,
    }));
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

  it("hands the component the table's refresh", () => {
    const container = mount({ component: { componentName: "OrderLines" } });
    container.querySelector<HTMLButtonElement>("[data-lines]")!.click();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("holds the band's place while its row loads, then says a failure, with a retry", () => {
    const config = { component: { componentName: "OrderLines" } };
    const loading = mount(config, "loading");
    expect(loading.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(loading.querySelector("[data-lines]")).toBeNull();
    app?.unmount();

    const onRetry = vi.fn();
    const failed = mount(config, "error", onRetry);
    expect(failed.querySelector("[data-lines]")).toBeNull();
    expect(failed.textContent).toContain("dms.table.load_error_title");
    failed.querySelector<HTMLButtonElement>("[data-retry]")!.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("lists the fields without a component", () => {
    const container = mount({ fields: [{ key: "carrier" }] });
    expect(container.querySelector("[data-lines]")).toBeNull();
    expect(container.querySelector("dt")?.textContent).toBe("Carrier");
  });
});
