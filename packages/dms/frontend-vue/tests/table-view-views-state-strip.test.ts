/** @vitest-environment jsdom */
import { computed, createApp, defineComponent, h, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableViews from "../layers/dms-ui/app/entries/components/table/Views";
import { mergeColumnOrder } from "../layers/dms-ui/app/entries/composables/table/utils/columnOrder";
import {
  isSameTableState,
  readTableUrlKey,
  snapshotViewState,
  viewSnapshot,
} from "../layers/dms-ui/app/entries/composables/table-view/utils/views";
import { pinnedStatus, DEFAULTS } from "./helpers/table-view-views-fixtures";
describe("table view states", () => {
  it("opens a view over the table's defaults", () => {
    const snapshot = viewSnapshot(
      {
        filters: [
          { accessorKey: "status", mode: "is", value: "closed" },
          { accessorKey: "owner", mode: "is", value: "{{user.id}}" },
        ],
        search: "invoice",
        sort: [{ field: "title" }],
        columns: { visible: ["email"], hidden: ["owner"], order: ["email"] },
        display: "grouped",
        density: "compact",
      },
      DEFAULTS,
    );
    expect(snapshot).toEqual({
      filters: [
        { ...pinnedStatus, value: "closed" },
        {
          accessorKey: "owner",
          mode: "is",
          value: "{{user.id}}",
          pinned: false,
        },
      ],
      search: "invoice",
      sorting: [{ id: "title", desc: false }],
      visibility: { title: true, owner: false, email: true },
      order: ["email"],
      display: "grouped",
      density: "compact",
    });
  });

  it("falls back to the defaults for what a view leaves out, and for a display the table lacks", () => {
    expect(viewSnapshot({ display: "kanban" }, DEFAULTS)).toEqual({
      filters: [pinnedStatus],
      search: "",
      sorting: DEFAULTS.sorting,
      visibility: DEFAULTS.visibility,
      order: [],
      display: "table",
      density: "default",
    });
  });

  it("tells a changed state from the view's, ignoring empty filters and blank searches", () => {
    const opened = viewSnapshot({ search: "invoice" }, DEFAULTS);
    expect(
      isSameTableState(
        opened,
        {
          ...opened,
          search: " invoice ",
          filters: [...opened.filters, { accessorKey: "owner", mode: "is" }],
        },
        DEFAULTS.columnOrder,
      ),
    ).toBe(true);
    expect(
      isSameTableState(
        opened,
        { ...opened, sorting: [{ id: "createdAt", desc: false }] },
        DEFAULTS.columnOrder,
      ),
    ).toBe(false);
    expect(
      isSameTableState(
        opened,
        { ...opened, visibility: { ...opened.visibility, email: true } },
        DEFAULTS.columnOrder,
      ),
    ).toBe(false);
    expect(
      isSameTableState(
        opened,
        { ...opened, density: "compact" },
        DEFAULTS.columnOrder,
      ),
    ).toBe(false);
  });

  it("compares column orders on the columns they move", () => {
    const opened = viewSnapshot({}, DEFAULTS);
    const fullDeclared = ["select", "title", "owner", "email", "actions"];
    expect(
      isSameTableState(
        opened,
        { ...opened, order: fullDeclared },
        DEFAULTS.columnOrder,
      ),
    ).toBe(true);
    expect(
      isSameTableState(
        opened,
        { ...opened, order: ["select", "email", "title", "owner", "actions"] },
        DEFAULTS.columnOrder,
      ),
    ).toBe(false);
  });

  it("keeps a state as a view that opens on the same state", () => {
    const state = viewSnapshot(
      {
        filters: [{ accessorKey: "owner", mode: "is", value: "u1" }],
        search: "late",
        sort: [{ field: "title", desc: true }],
        columns: { hidden: ["title"], order: ["owner", "title"] },
        display: "grouped",
      },
      DEFAULTS,
    );
    expect(
      isSameTableState(
        viewSnapshot(snapshotViewState(state), DEFAULTS),
        state,
        DEFAULTS.columnOrder,
      ),
    ).toBe(true);
  });

  it("reads a view or a tab off the URL, the short key only for a page's only table", () => {
    const query = { "content.view": "mine", view: "other", tab: "open" };
    expect(
      readTableUrlKey(
        query,
        { tableId: "content", isSoleTableView: false },
        "view",
      ),
    ).toEqual({ value: "mine" });
    expect(
      readTableUrlKey(
        { tab: "open" },
        { tableId: "content", isSoleTableView: true },
        "tab",
      ),
    ).toEqual({ value: "open" });
    expect(
      readTableUrlKey(
        { tab: "open" },
        { tableId: "content", isSoleTableView: false },
        "tab",
      ),
    ).toEqual({ ignoredShortKey: true });
    expect(readTableUrlKey({}, { tableId: "content" }, "view")).toEqual({});
  });

  it("reads an empty key as cleared, not as absent", () => {
    const sole = { tableId: "content", isSoleTableView: true };
    expect(readTableUrlKey({ "content.view": "" }, sole, "view")).toEqual({
      isCleared: true,
    });
    expect(readTableUrlKey({ view: "" }, sole, "view")).toEqual({
      isCleared: true,
    });
    expect(
      readTableUrlKey(
        { view: "" },
        { tableId: "content", isSoleTableView: false },
        "view",
      ),
    ).toEqual({});
  });
});

describe("table views strip", () => {
  let app: App | undefined;

  const mountStrip = (props: InstanceType<typeof TableViews>["$props"]) => {
    const emitted: Array<[string, unknown?]> = [];
    app = createApp({
      render: () =>
        h(TableViews, {
          ...props,
          onOpen: (id: string) => emitted.push(["open", id]),
          onReset: () => emitted.push(["reset"]),
          onSave: () => emitted.push(["save"]),
          onSaveAs: () => emitted.push(["saveAs"]),
          onDelete: (id: string) => emitted.push(["delete", id]),
        }),
    });
    app.component(
      "UButton",
      defineComponent({
        props: { label: String, ariaLabel: String },
        emits: ["click"],
        setup:
          (buttonProps, { emit, slots }) =>
          () =>
            h(
              "button",
              {
                "aria-label": buttonProps.ariaLabel,
                onClick: () => emit("click"),
              },
              slots.default?.() ?? buttonProps.label,
            ),
      }),
    );
    app.component("UIcon", defineComponent({ setup: () => () => h("i") }));
    app.component(
      "USkeleton",
      defineComponent({ setup: () => () => h("span") }),
    );
    app.component(
      "UDropdownMenu",
      defineComponent({
        setup:
          (_, { slots }) =>
          () =>
            slots.default?.(),
      }),
    );
    const container = document.createElement("div");
    app.mount(container);
    return { container, emitted };
  };

  beforeEach(() => {
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("useI18n", () => ({
      t: (key: string) => key,
      locale: ref("en"),
    }));
    vi.stubGlobal("useDmsAppConfig", () => ({ ui: { icons: {} } }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  const items = [
    { id: "all", label: "All workspaces" },
    { id: "late", label: "Past due", tone: "error", count: 3 },
    { id: "user-1", label: "Mine", isUserView: true },
  ];

  it("draws the views as pills with their counters and opens the one clicked", () => {
    const { container, emitted } = mountStrip({
      items,
      activeId: "all",
      layout: "strip",
      canSaveAs: true,
    });
    const pills = [
      ...container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
    ];
    expect(pills.map((pill) => pill.textContent?.trim())).toEqual([
      "All workspaces",
      "Past due 3",
      "Mine",
    ]);
    expect(pills[0]!.getAttribute("aria-pressed")).toBe("true");
    pills[1]!.click();
    const saveCurrent = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("dms.table.views.save_current"),
    );
    saveCurrent!.click();
    expect(emitted).toEqual([["open", "late"], ["saveAs"]]);
  });

  it("offers Reset on a modified view, and Save and Delete on the user's own", () => {
    const { container, emitted } = mountStrip({
      items,
      activeId: "user-1",
      layout: "strip",
      modified: true,
      canSaveAs: true,
    });
    const labels = [...container.querySelectorAll("button[aria-label]")].map(
      (button) => button.getAttribute("aria-label"),
    );
    expect(labels).toEqual([
      "dms.table.views.reset",
      "dms.table.views.save",
      "dms.table.views.delete",
    ]);
    container
      .querySelector<HTMLButtonElement>(
        'button[aria-label="dms.table.views.delete"]',
      )!
      .click();
    expect(emitted).toEqual([["delete", "user-1"]]);
  });
});

describe("column order", () => {
  it("completes a partial order, the checkbox, caret and actions at their edges", () => {
    const declared = ["select", "expand", "title", "owner", "email", "actions"];
    expect(mergeColumnOrder(["email", "gone", "actions"], declared)).toEqual([
      "select",
      "expand",
      "email",
      "title",
      "owner",
      "actions",
    ]);
    expect(mergeColumnOrder([], declared)).toEqual(declared);
  });
});
