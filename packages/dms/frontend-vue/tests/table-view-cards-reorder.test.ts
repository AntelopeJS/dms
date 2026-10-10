// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  type App,
  type PropType,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import CardsDisplay from "../layers/dms-ui/app/build/components/table-view/CardsDisplay.vue";
import { useTableReorder } from "../layers/dms-ui/app/build/composables/table-view/useTableReorder";
import { moveRow } from "../layers/dms-ui/app/build/composables/table-view/utils/reorder";
import type {
  TableViewCardReorder,
  TableViewDisplayContext,
} from "../layers/dms-ui/app/composables/table-view/types/display";

vi.mock("../layers/dms-ui/app/build/components/table/Pagination.vue", () => ({
  default: { render: () => null },
}));
vi.mock("../layers/dms-ui/app/build/components/table/Empty.vue", () => ({
  default: { render: () => null },
}));

type Row = { _id: string; name: string };
type Api = Parameters<typeof useTableReorder>[0]["api"];

const tableViewSource = readFileSync(
  resolve(
    __dirname,
    "../layers/dms-ui/app/components/table-view/TableView.vue",
  ),
  "utf8",
);

const TaskCard = defineComponent({
  props: {
    rowId: String,
    selected: Boolean,
    reorder: Object as PropType<TableViewCardReorder>,
  },
  setup: (props) => () =>
    h("article", { "data-selected": String(props.selected) }, [
      props.rowId,
      props.reorder ? h("button", props.reorder.handle) : null,
    ]),
});

function createContext(enabled = true, componentName?: string) {
  const items = ref<Row[]>(
    ["t0", "t1", "t2"].map((id) => ({ _id: id, name: `Task ${id}` })),
  );
  const moves: [number, number][] = [];
  const opened: unknown[] = [];
  const selected = ref<string[]>(["t1"]);
  const reorder = {
    enabled,
    move: (from: number, to: number) => {
      moves.push([from, to]);
      items.value = moveRow(items.value, from, to);
    },
  };
  const context = reactive({
    items,
    columns: [],
    loading: false,
    rowIdKey: "_id",
    labelKey: "name",
    options: componentName ? { card: { component: { componentName } } } : {},
    pagination: { pageIndex: 0, pageSize: 10, total: 3 },
    selection: {
      isSelected: (id: string) => selected.value.includes(id),
      toggle: (id: string, value?: boolean) => {
        const on = value ?? !selected.value.includes(id);
        selected.value = on
          ? [...selected.value, id]
          : selected.value.filter((entry) => entry !== id);
      },
    },
    actions: { canAdd: false, open: (item: unknown) => opened.push(item) },
    reorder,
  }) as unknown as TableViewDisplayContext<Row>;
  return { context, items, moves, opened, selected };
}

const dragEvent = (type: string) => new Event(type, { bubbles: true });
const key = (name: string) =>
  new KeyboardEvent("keydown", { key: name, bubbles: true });

describe("the cards display of a hand-ordered table", () => {
  let app: App | undefined;
  let container: HTMLElement;

  const mount = (context: TableViewDisplayContext<Row>) => {
    app = createApp({ render: () => h(CardsDisplay, { context }) });
    app.component(
      "UCheckbox",
      defineComponent({
        emits: ["update:modelValue"],
        setup:
          (_, { emit }) =>
          () =>
            h("input", {
              type: "checkbox",
              onChange: () => emit("update:modelValue", true),
            }),
      }),
    );
    app.component("UIcon", defineComponent({ render: () => h("i") }));
    container = document.createElement("div");
    document.body.append(container);
    app.mount(container);
  };
  const handles = () => [
    ...container.querySelectorAll<HTMLButtonElement>("button[draggable]"),
  ];
  const cards = () => [...container.querySelectorAll("article")];

  beforeEach(() => {
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("h", h);
    vi.stubGlobal("useI18n", () => ({
      locale: ref("en"),
      t: (text: string) => text,
    }));
    vi.stubGlobal("useTranslation", () => ({ processI18n: (t: string) => t }));
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
    vi.stubGlobal("resolveDmsComponent", (name: string) =>
      name === "TaskCard" ? TaskCard : undefined,
    );
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    container.remove();
    vi.unstubAllGlobals();
  });

  it("moves a card dragged by its handle onto the card it is dropped on", async () => {
    const { context, moves, items } = createContext();
    mount(context);
    expect(handles()).toHaveLength(3);
    expect(handles()[0]!.getAttribute("aria-label")).toBe(
      "dms.table.reorder.move",
    );
    handles()[2]!.dispatchEvent(dragEvent("dragstart"));
    await nextTick();
    expect(cards()[2]!.classList.contains("opacity-50")).toBe(true);
    cards()[0]!.dispatchEvent(dragEvent("drop"));
    expect(moves).toEqual([[2, 0]]);
    expect(items.value.map((row) => row._id)).toEqual(["t2", "t0", "t1"]);
  });

  it("moves a card by one with the arrow keys and keeps the focus on its handle", async () => {
    const { context, moves, items } = createContext();
    mount(context);
    const handle = handles()[1]!;
    handle.focus();
    handle.dispatchEvent(key("ArrowLeft"));
    await nextTick();
    await nextTick();
    expect(items.value.map((row) => row._id)).toEqual(["t1", "t0", "t2"]);
    expect(document.activeElement).toBe(handle);
    handles()[2]!.dispatchEvent(key("ArrowDown"));
    handles()[0]!.dispatchEvent(key("ArrowUp"));
    expect(moves).toEqual([[1, 0]]);
  });

  it("keeps its selection and its default action beside the handle", () => {
    const { context, opened, selected } = createContext();
    mount(context);
    handles()[0]!.click();
    handles()[0]!.dispatchEvent(key("Enter"));
    expect(opened).toEqual([]);
    container.querySelectorAll("input")[0]!.dispatchEvent(new Event("change"));
    expect(selected.value).toEqual(["t1", "t0"]);
    cards()[2]!.click();
    expect(opened).toEqual([context.items[2]]);
  });

  it("disables the handle while moving is off, saying how to turn it on", () => {
    const { context, moves } = createContext(false);
    mount(context);
    const handle = container.querySelector("header button")!;
    expect(handle.hasAttribute("disabled")).toBe(true);
    expect(handle.getAttribute("title")).toBe("dms.table.reorder.disabled");
    handle.dispatchEvent(dragEvent("dragstart"));
    cards()[0]!.dispatchEvent(dragEvent("drop"));
    expect(moves).toEqual([]);
  });

  it("draws no handle on a table not ordered by hand", () => {
    const { context } = createContext();
    (context as { reorder?: unknown }).reorder = undefined;
    mount(context);
    expect(container.querySelector("header button")).toBe(null);
  });

  it("hands a custom card its handle, its selection, and drops on it", () => {
    const { context, moves } = createContext(true, "TaskCard");
    mount(context);
    expect(cards().map((card) => card.dataset.selected)).toEqual([
      "false",
      "true",
      "false",
    ]);
    handles()[0]!.dispatchEvent(dragEvent("dragstart"));
    cards()[2]!.dispatchEvent(dragEvent("drop"));
    expect(moves).toEqual([[0, 2]]);
    handles()[1]!.dispatchEvent(key("ArrowRight"));
    expect(moves).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });
});

describe("which displays move rows", () => {
  it("offers moving on the grid and the cards, never on the board or the groups", () => {
    expect(tableViewSource).toMatch(
      /ORDERED_DISPLAY_IDS = new Set\(\[TABLE_DISPLAY_ID, CARDS_DISPLAY_ID\]\)/,
    );
    expect(tableViewSource).toMatch(/reorder: reorderState\.value,/);
  });

  it("draws no handle on a display that does not draw the rows in their order", () => {
    vi.stubGlobal("computed", computed);
    const { reorderState } = useTableReorder({
      reorder: { field: "position" },
      data: ref(null),
      rowIdKey: "_id",
      location: "/api/features",
      api: vi.fn() as unknown as Api,
      canEdit: computed(() => true),
      isNarrowed: computed(() => false),
      isOrderedDisplay: computed(() => false),
      refresh: vi.fn(),
      onError: vi.fn(),
    });
    expect(reorderState.value).toBe(undefined);
    vi.unstubAllGlobals();
  });
});
