/**
 * @packageDocumentation
 * @vitest-environment jsdom
 */
import { createApp, defineComponent, h, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExpandedRowDetail from "../layers/dms-ui/app/entries/components/table-view/ExpandedRowDetail";
import type { TableViewExpandableConfig } from "../layers/dms-ui/app/composables/table-view/types";
import { displayContext } from "./fixtures/displayContext";
import { tableViewColumn } from "./fixtures/tableViewColumn";
import type { ExpandedRowLoadState } from "../layers/dms-ui/app/entries/composables/table-view/useExpandedRowDetails";
import { defined } from "./helpers/defined";

const OrderLines = defineComponent({
  props: { row: Object, rowId: String, refresh: Function, open: Function },
  setup: (props) => () =>
    h(
      "button",
      {
        "data-lines": props.rowId,
        onClick: () => {
          props.refresh?.();
        },
      },
      String(props.row?.number),
    ),
});

const refresh = vi.fn();

const columns = [
  tableViewColumn("carrier", { header: "Carrier" }),
  tableViewColumn("number", { header: "Number" }),
];

interface BandRow {
  number?: string;
  carrier?: string | number | boolean | object | null;
}

let app: App | undefined;

const mount = (
  config: TableViewExpandableConfig,
  loadState: ExpandedRowLoadState = "ready",
  onRetry = () => {},
  row: BandRow = { number: "A-1", carrier: "UPS" },
) => {
  app = createApp({
    render: () =>
      h(ExpandedRowDetail, {
        rowProps: {
          row: { ...row },
          rowId: "a1",
          columns,
          actions: displayContext().actions,
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

describe("TableView expanded row band", () => {
  it("hands the whole band to the component", () => {
    const container = mount({
      component: { componentName: "OrderLines" },
      fields: [{ key: "carrier" }],
    });
    expect(container.querySelector("[data-lines='a1']")?.textContent).toBe(
      "A-1",
    );
    expect(container.querySelector("dl")).toBeNull();
  });

  it("hands the component the table's refresh", () => {
    const container = mount({ component: { componentName: "OrderLines" } });
    defined(container.querySelector<HTMLButtonElement>("[data-lines]")).click();
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
    defined(failed.querySelector<HTMLButtonElement>("[data-retry]")).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("lists the fields without a component", () => {
    const container = mount({ fields: [{ key: "carrier" }] });
    expect(container.querySelector("[data-lines]")).toBeNull();
    expect(container.querySelector("dt")?.textContent).toBe("Carrier");
  });
});

describe("a field of the expanded row band", () => {
  it("cuts a value to its line by default, and shows a full-width one whole", () => {
    const cut = mount({ fields: [{ key: "carrier" }] });
    expect(cut.querySelector("dd .truncate")?.textContent).toBe("UPS");
    app?.unmount();

    const full = mount({ fields: [{ key: "carrier", fullWidth: true }] });
    const value = defined(full.querySelector("dd"));
    expect(value.textContent).toBe("UPS");
    expect(value.querySelector(".truncate")).toBeNull();
    expect(value.classList).toContain("whitespace-pre-line");
    expect(value.classList).toContain("wrap-anywhere");
  });

  it("draws a full-width value with its type's full formatter, others with the default one", () => {
    vi.stubGlobal("useDataTypes", () => ({
      getDataType: () => ({
        formatter: { default: () => "2 entries", full: () => "a, b" },
      }),
    }));
    const config = (fullWidth: boolean) => ({
      fields: [{ key: "carrier", fullWidth }],
    });
    expect(mount(config(false)).querySelector("dd")?.textContent).toBe(
      "2 entries",
    );
    app?.unmount();
    expect(mount(config(true)).querySelector("dd")?.textContent).toBe("a, b");
  });

  it.each([undefined, null, "", [], {}])(
    "leaves a hideEmpty field out of a row holding %j, and no other",
    (carrier) => {
      const container = mount(
        {
          fields: [{ key: "carrier", hideEmpty: true }, { key: "number" }],
        },
        "ready",
        undefined,
        { number: "A-1", carrier },
      );
      const labels = [...container.querySelectorAll("dt")];
      expect(labels.map((label) => label.textContent)).toEqual(["Number"]);
    },
  );

  it.each([0, false])("keeps a hideEmpty field holding %j", (carrier) => {
    const container = mount(
      { fields: [{ key: "carrier", hideEmpty: true }] },
      "ready",
      undefined,
      { carrier },
    );
    expect(container.querySelector("dt")?.textContent).toBe("Carrier");
  });

  it("says a band whose fields are all hidden is empty", () => {
    const container = mount(
      { fields: [{ key: "carrier", hideEmpty: true }] },
      "ready",
      undefined,
      {},
    );
    expect(container.querySelector("dl")).toBeNull();
    expect(container.textContent).toContain("dms.form.empty_value");
  });
});
