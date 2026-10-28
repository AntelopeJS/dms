/** @vitest-environment jsdom */
import "./helpers/table-runtime";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  type App,
  type Component,
  type PropType,
} from "vue";
import {
  getCoreRowModel,
  useVueTable,
  type ColumnDef,
  type Table,
} from "@tanstack/vue-table";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardsDisplay from "../layers/dms-ui/app/build/components/table-view/CardsDisplay.vue";
import type { TableViewDisplayContext } from "../layers/dms-ui/app/composables/table-view/types/display";

type Row = { _id: string; name: string };

const rows: Row[] = [
  { _id: "t1", name: "Printer jam" },
  { _id: "t2", name: "VPN down" },
];

const actionsColumn = (edited: string[]): ColumnDef<Row> => ({
  id: "actions",
  cell: ({ row }) =>
    h("div", { class: "opacity-40" }, [
      h(
        "button",
        {
          "aria-label": `Actions for ${row.original.name}`,
          onClick: (event: Event) => {
            event.stopPropagation();
            edited.push(row.id);
          },
        },
        "…",
      ),
    ]),
});

const TicketCard = defineComponent({
  props: {
    rowId: String,
    rowActions: Object as PropType<Component>,
  },
  setup: (props) => () =>
    h("article", { "data-id": props.rowId }, [
      props.rowActions ? h(props.rowActions) : null,
    ]),
});

function createTable(columns: ColumnDef<Row>[]): Table<Row> {
  return useVueTable({
    data: rows,
    columns,
    getRowId: (row) => row._id,
    getCoreRowModel: getCoreRowModel(),
  });
}

function createContext(table?: Table<Row>, componentName?: string) {
  const opened: unknown[] = [];
  const context = reactive({
    items: rows,
    columns: [],
    loading: false,
    rowIdKey: "_id",
    labelKey: "name",
    options: componentName ? { card: { component: { componentName } } } : {},
    pagination: { pageIndex: 0, pageSize: 10, total: 2 },
    selection: { isSelected: () => false, toggle: () => {} },
    actions: { canAdd: false, open: (item: unknown) => opened.push(item) },
    table,
  }) as unknown as TableViewDisplayContext<Row>;
  return { context, opened };
}

describe("the row actions of the cards display", () => {
  let app: App | undefined;
  let container: HTMLElement;

  const mount = (context: TableViewDisplayContext<Row>) => {
    app = createApp({ render: () => h(CardsDisplay, { context }) });
    app.component(
      "UCheckbox",
      defineComponent({ render: () => h("input", { type: "checkbox" }) }),
    );
    app.component("UIcon", defineComponent({ render: () => h("i") }));
    container = document.createElement("div");
    document.body.append(container);
    app.mount(container);
  };
  const menus = () => [
    ...container.querySelectorAll<HTMLButtonElement>(
      "button[aria-label^='Actions']",
    ),
  ];

  beforeEach(() => {
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("h", h);
    vi.stubGlobal("useI18n", () => ({
      locale: ref("en"),
      t: (t: string) => t,
    }));
    vi.stubGlobal("resolveDmsComponent", (name: string) =>
      name === "TicketCard" ? TicketCard : undefined,
    );
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    container.remove();
    vi.unstubAllGlobals();
  });

  it("puts the grid row's actions last in each card's header, at full strength", () => {
    const edited: string[] = [];
    const { context } = createContext(createTable([actionsColumn(edited)]));
    mount(context);
    expect(menus().map((menu) => menu.getAttribute("aria-label"))).toEqual([
      "Actions for Printer jam",
      "Actions for VPN down",
    ]);
    const header = container.querySelector("article header")!;
    expect(header.lastElementChild!.contains(menus()[0]!)).toBe(true);
    expect(header.lastElementChild!.className).toContain("[&>div]:opacity-100");
  });

  it("runs the action without opening the card, by click or by key", () => {
    const edited: string[] = [];
    const { context, opened } = createContext(
      createTable([actionsColumn(edited)]),
    );
    mount(context);
    menus()[1]!.click();
    menus()[1]!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(edited).toEqual(["t2"]);
    expect(opened).toEqual([]);
    container.querySelector("article")!.click();
    expect(opened).toEqual([rows[0]]);
  });

  it("draws no actions for a table with no row action, or outside a table", () => {
    mount(createContext(createTable([])).context);
    expect(container.querySelectorAll("article")).toHaveLength(2);
    expect(menus()).toHaveLength(0);
    app!.unmount();
    container.remove();
    mount(createContext().context);
    expect(menus()).toHaveLength(0);
  });

  it("hands a custom card its row's actions, kept across renders", async () => {
    const edited: string[] = [];
    const { context, opened } = createContext(
      createTable([actionsColumn(edited)]),
      "TicketCard",
    );
    const received: Component[] = [];
    const Spy = defineComponent({
      props: { rowId: String, rowActions: Object as PropType<Component> },
      setup: (props) => () => {
        if (props.rowActions) received.push(props.rowActions);
        return h(TicketCard, props);
      },
    });
    vi.stubGlobal("resolveDmsComponent", () => Spy);
    mount(context);
    expect(menus()).toHaveLength(2);
    menus()[0]!.click();
    expect(edited).toEqual(["t1"]);
    expect(opened).toEqual([]);
    const first = received.slice(0, 2);
    (context as { loading: boolean }).loading = true;
    context.items = [...rows];
    await nextTick();
    expect(received.length).toBeGreaterThan(2);
    expect(received.slice(-2)).toEqual(first);
  });
});
