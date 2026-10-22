// @vitest-environment jsdom
import { computed, createApp, defineComponent, h, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardsDisplay from "../layers/dms-ui/app/build/components/table-view/CardsDisplay.vue";
import {
  buildCardProps,
  cardAvatar,
  cardFieldColumns,
  cardIdentity,
  cardSubtitle,
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
vi.mock("../layers/dms-ui/app/composables/useFileReadUrls", () => ({
  useFileReadUrls: () => ({
    getUrl: (key: string) => `/files/${key}`,
    resolve: async () => {},
  }),
}));

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
    vi.stubGlobal("useI18n", () => ({
      locale: ref("en"),
      t: (key: string) => key,
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

describe("the default cards", () => {
  let app: App | undefined;

  beforeEach(() => {
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("useI18n", () => ({
      locale: ref("en"),
      t: (key: string) => key,
    }));
    vi.stubGlobal("useTranslation", () => ({ processI18n: (t: string) => t }));
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("open from the keyboard, but not through their checkbox", () => {
    const { context, opened } = createContext();
    context.options = {};
    app = createApp({ render: () => h(CardsDisplay, { context }) });
    app.component(
      "UCheckbox",
      defineComponent({ render: () => h("button", { type: "button" }) }),
    );
    const container = document.createElement("div");
    app.mount(container);

    const cards = [...container.querySelectorAll("article")];
    expect(cards.map((card) => card.tabIndex)).toEqual([0, 0]);
    const enter = () =>
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true });
    cards[1]!.dispatchEvent(enter());
    expect(opened).toEqual([rows[1]]);
    cards[0]!.querySelector("button")!.dispatchEvent(enter());
    expect(opened).toEqual([rows[1]]);
  });

  it("show the title column's subtitle and avatar, never the database id", () => {
    const { context } = createContext();
    context.options = {};
    app = createApp({ render: () => h(CardsDisplay, { context }) });
    app.component("UCheckbox", { render: () => null });
    app.component(
      "UAvatar",
      defineComponent({
        props: { src: String },
        setup: (props) => () => h("img", { src: props.src }),
      }),
    );
    const container = document.createElement("div");
    app.mount(container);
    expect(container.textContent).not.toContain("t1");
    expect(container.querySelector("img")).toBeNull();
    app.unmount();

    context.columns = [
      {
        id: "name",
        accessorKey: "name",
        display: {
          type: "identity",
          options: { subtitleField: "email", avatarField: "photo" },
        },
      } as TableViewColumn,
    ];
    context.items = [
      { ...rows[0]!, email: "ann@example.com", photo: { key: "ann.png" } },
      rows[1]!,
    ];
    app = createApp({ render: () => h(CardsDisplay, { context }) });
    app.component("UCheckbox", { render: () => null });
    app.component(
      "UAvatar",
      defineComponent({
        props: { src: String },
        setup: (props) => () => h("img", { src: props.src }),
      }),
    );
    const next = document.createElement("div");
    app.mount(next);
    const [first, second] = [...next.querySelectorAll("article")];
    expect(first!.textContent).toContain("ann@example.com");
    expect(first!.querySelector("img")?.getAttribute("src")).toBe(
      "/files/ann.png",
    );
    // Without an avatar, the title's initials stand in.
    expect(second!.querySelector("img")).toBeNull();
    expect(second!.textContent).toContain("SI");
  });
});

describe("card subtitle and avatar", () => {
  const identityColumn = {
    id: "name",
    accessorKey: "name",
    display: {
      type: "identity",
      options: { subtitleField: "email", avatarField: "avatar", storage: "s" },
    },
  } as TableViewColumn;

  it("reads them off the title column's identity display", () => {
    expect(cardIdentity([identityColumn], "name")).toEqual({
      subtitleField: "email",
      avatarField: "avatar",
      storage: "s",
    });
    expect(cardIdentity([identityColumn], undefined)).toEqual({});
    expect(
      cardIdentity([{ ...identityColumn, display: { type: "mono" } }], "name"),
    ).toEqual({});
  });

  it("never shows the database id, but a key the table names its rows by", () => {
    const row = { _id: "proj-074", code: "CH-0155", name: "Roof" };
    const byId = { labelKey: "name", rowIdKey: "_id" };
    expect(cardSubtitle(row, {}, byId)).toBeUndefined();
    expect(cardSubtitle(row, {}, { labelKey: "name", rowIdKey: "code" })).toBe(
      "CH-0155",
    );
    // The title is the id already: no second line repeats it.
    expect(
      cardSubtitle(
        { code: "CH-0155" },
        {},
        { labelKey: "name", rowIdKey: "code" },
      ),
    ).toBeUndefined();
    expect(
      cardSubtitle(
        { ...row, email: "a@b.c" },
        { subtitleField: "email" },
        byId,
      ),
    ).toBe("a@b.c");
  });

  it("takes an image value or a URL as the avatar", () => {
    const identity = { avatarField: "avatar" };
    expect(cardAvatar({ avatar: { key: "k" } }, identity)).toEqual({
      key: "k",
    });
    expect(cardAvatar({ avatar: "https://x/a.png" }, identity)).toBe(
      "https://x/a.png",
    );
    expect(cardAvatar({ avatar: "" }, identity)).toBeUndefined();
    expect(cardAvatar({ avatar: { key: "k" } }, {})).toBeUndefined();
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
