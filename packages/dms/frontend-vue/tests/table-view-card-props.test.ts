// @vitest-environment jsdom
import { computed, createApp, defineComponent, h, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import CardsDisplay from "../layers/dms-ui/app/build/components/table-view/CardsDisplay.vue";
import {
  buildCardProps,
  cardFieldColumns,
} from "../layers/dms-ui/app/build/composables/table-view/utils/card";
import type { TableViewColumn } from "../layers/dms-ui/app/composables/table-view/types/column";
import type {
  TableViewCardProps,
  TableViewDisplayContext,
} from "../layers/dms-ui/app/composables/table-view/types/display";

vi.mock("../layers/dms-ui/app/build/components/table/Pagination.vue", () => ({
  default: { render: () => null },
}));
vi.mock("../layers/dms-ui/app/build/components/table/Empty.vue", () => ({
  default: { render: () => null },
}));

const kanbanBoardSource = readFileSync(
  resolve(
    __dirname,
    "../layers/dms-ui/app/components/table-view/KanbanBoard.vue",
  ),
  "utf8",
);

const rows = [
  { _id: "t1", name: "Write the docs" },
  { _id: "t2", name: "Ship it" },
];

function createContext() {
  const selected = ref<string[]>(["t2"]);
  const opened: unknown[] = [];
  const context = {
    items: rows,
    columns: [],
    loading: false,
    rowIdKey: "_id",
    labelKey: "name",
    options: { card: { component: { componentName: "TaskCard" } } },
    pagination: { pageIndex: 0, pageSize: 10, total: 2 },
    selection: {
      ids: selected.value,
      isSelected: (id: string) => selected.value.includes(id),
      toggle: (id: string, value?: boolean) => {
        const on = value ?? !selected.value.includes(id);
        selected.value = on
          ? [...selected.value, id]
          : selected.value.filter((entry) => entry !== id);
      },
    },
    actions: {
      canAdd: false,
      open: (item: unknown) => opened.push(item),
    },
  } as unknown as TableViewDisplayContext<(typeof rows)[number]>;
  return { context, selected, opened };
}

describe("table view card props", () => {
  it("hands a card its row, selection and default action", () => {
    const { context, selected, opened } = createContext();
    const props = buildCardProps(rows[0]!, context);
    expect(props).toMatchObject({
      row: rows[0],
      rowId: "t1",
      labelKey: "name",
      selected: false,
    });
    props.select(true);
    expect(selected.value).toContain("t1");
    props.open();
    expect(opened).toEqual([rows[0]]);
    expect(buildCardProps(rows[1]!, context).selected).toBe(true);
  });

  it("gives a kanban card the same props, plus its column's value", () => {
    expect(kanbanBoardSource).toMatch(
      /buildCardProps\(item, props\.cardContext\)/,
    );
    expect(kanbanBoardSource).toMatch(/groupValue,\n\s*\}\);/);
  });
});

describe("cards display with a custom card", () => {
  let app: App | undefined;
  const received: TableViewCardProps[] = [];

  const TaskCard = defineComponent({
    props: {
      row: Object,
      rowId: String,
      columns: Array,
      labelKey: String,
      actions: Object,
      selected: Boolean,
      select: Function,
      open: Function,
    },
    setup: (props) => () => {
      received.push({ ...props } as unknown as TableViewCardProps);
      return h("button", { onClick: () => props.open?.() }, props.rowId);
    },
  });

  beforeEach(() => {
    received.length = 0;
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("h", h);
    vi.stubGlobal("useI18n", () => ({ locale: ref("en") }));
    vi.stubGlobal("useTranslation", () => ({ processI18n: (t: string) => t }));
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
    vi.stubGlobal("resolveDmsComponent", (name: string) =>
      name === "TaskCard" ? TaskCard : undefined,
    );
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("draws every row with the card component and its props", () => {
    const { context, opened } = createContext();
    app = createApp({ render: () => h(CardsDisplay, { context }) });
    const container = document.createElement("div");
    app.mount(container);

    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["t1", "t2"]);
    expect(received.map((props) => props.selected)).toEqual([false, true]);
    buttons[0]!.click();
    expect(opened).toEqual([rows[0]]);
  });
});

describe("card fields", () => {
  const columns = [
    "_id",
    "name",
    "status",
    "owner",
    "due",
    "hidden",
    "size",
    "tags",
  ].map(
    (key) =>
      ({
        id: key,
        accessorKey: key,
        listable: key !== "hidden",
      }) as TableViewColumn,
  );
  const keys = (picked: TableViewColumn[]) =>
    picked.map((column) => column.accessorKey);

  it("shows the declared fields, in their order", () => {
    expect(
      keys(
        cardFieldColumns(columns, ["due", "name", "gone"], { rowIdKey: "_id" }),
      ),
    ).toEqual(["due", "name"]);
  });

  it("falls back to the first listable columns besides the title and the id, on the board too", () => {
    const shown = { labelKey: "name", rowIdKey: "_id" };
    expect(keys(cardFieldColumns(columns, undefined, shown))).toEqual([
      "status",
      "owner",
      "due",
      "size",
    ]);
    // A kanban card sits in its group's column: the group is not repeated.
    expect(
      keys(
        cardFieldColumns(columns, undefined, { ...shown, others: ["status"] }),
      ),
    ).toEqual(["owner", "due", "size", "tags"]);
  });
});
