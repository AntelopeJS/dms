// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onMounted,
  ref,
  watch,
  type App,
} from "vue";
import type { SortingState, VisibilityState } from "@tanstack/vue-table";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableViews from "../layers/dms-ui/app/build/components/table/Views.vue";
import { mergeColumnOrder } from "../layers/dms-ui/app/build/composables/table/utils/columnOrder";
import { useTableViews } from "../layers/dms-ui/app/build/composables/table-view/useTableViews";
import {
  isSameTableState,
  readTableUrlKey,
  snapshotViewState,
  type TableStateDefaults,
  viewSnapshot,
} from "../layers/dms-ui/app/build/composables/table-view/utils/views";
import type { TableViewViewsConfig } from "../layers/dms-ui/app/composables/table-view/types";
import type {
  TableDensity,
  TableFilter,
} from "../layers/dms-ui/app/build/components/table/Table.vue";

const pinnedStatus: TableFilter = {
  accessorKey: "status",
  mode: "is",
  value: "open",
  pinned: true,
  initialValue: "open",
};

const DEFAULTS: TableStateDefaults = {
  pinnedFilters: [pinnedStatus],
  sorting: [{ id: "createdAt", desc: true }],
  visibility: { title: true, owner: true, email: false },
  columnOrder: ["title", "owner", "email"],
  display: "table",
  density: "default",
  displays: new Set(["table", "grouped"]),
};

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
});

interface HarnessOptions {
  views: TableViewViewsConfig;
  query?: Record<string, string>;
  preferences?: Record<string, unknown>;
  userId?: string;
  viewName?: string;
}

describe("useTableViews", () => {
  let app: App | undefined;
  let toasts: unknown[];

  const mountViews = async (options: HarnessOptions) => {
    const preferences = new Map<string, unknown>(
      Object.entries(options.preferences ?? {}),
    );
    vi.stubGlobal("usePreferences", () => ({
      getPreference: (key: string, fallback: unknown) =>
        preferences.has(key) ? preferences.get(key) : fallback,
      setPreference: (key: string, value: unknown) =>
        preferences.set(key, value),
    }));
    vi.stubGlobal("useUserSession", () => ({
      user: ref({ _id: options.userId ?? "u1" }),
    }));
    vi.stubGlobal("useDmsRoute", () => ({ query: options.query ?? {} }));
    vi.stubGlobal("useConfirm", () => ({
      confirm: async (dialog: {
        onConfirm: (values: Record<string, unknown>) => Promise<void>;
      }) => {
        await dialog.onConfirm({ label: options.viewName ?? "Mine" });
        return true;
      },
    }));

    const state = {
      columnFilters: ref<TableFilter[]>([]),
      globalFilter: ref<string | undefined>(),
      sorting: ref<SortingState>([]),
      columnVisibility: ref<VisibilityState>({}),
      columnOrder: ref<string[]>([]),
      display: ref("table"),
      density: ref<TableDensity>("default"),
      pagination: ref({ pageIndex: 3, pageSize: 10 }),
    };
    let api: ReturnType<typeof useTableViews> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          api = useTableViews({
            views: options.views,
            defaults: DEFAULTS,
            state,
            preferenceKey: (suffix) => `tables.content.page.${suffix}`,
            urlScope: { tableId: "content", isSoleTableView: true },
          });
          return () => h("div");
        },
      }),
    );
    app.mount(document.createElement("div"));
    await nextTick();
    return { api: api!, state, preferences };
  };

  const VIEWS: TableViewViewsConfig = {
    defaultView: "all",
    userViews: true,
    items: [
      { id: "all", label: "All" },
      {
        id: "mine",
        label: "$tickets.mine",
        filters: [{ accessorKey: "owner", mode: "is", value: "{{user.id}}" }],
        sort: [{ field: "title" }],
      },
    ],
  };

  beforeEach(() => {
    toasts = [];
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("watch", watch);
    vi.stubGlobal("onMounted", onMounted);
    vi.stubGlobal("Color", { warning: "warning" });
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useTranslation", () => ({
      processI18n: (text: string) => text.replace(/^\$/, "i18n:"),
    }));
    vi.stubGlobal("useToast", () => ({
      add: (toast: unknown) => toasts.push(toast),
    }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("opens the view the URL names, over the state kept from the last visit", async () => {
    const { api, state } = await mountViews({
      views: VIEWS,
      query: { view: "mine" },
      preferences: { "tables.content.page.activeView": "all" },
    });
    expect(api.activeViewId.value).toBe("mine");
    expect(state.columnFilters.value).toEqual([
      { ...pinnedStatus },
      { accessorKey: "owner", mode: "is", value: "{{user.id}}", pinned: false },
    ]);
    expect(state.sorting.value).toEqual([{ id: "title", desc: false }]);
    expect(state.pagination.value.pageIndex).toBe(0);
    expect(api.items.value[1]?.label).toBe("i18n:tickets.mine");
  });

  it("falls back to the default view, with a word, for a view the caller cannot open", async () => {
    const { api } = await mountViews({
      views: VIEWS,
      query: { "content.view": "user-of-someone-else" },
    });
    expect(api.activeViewId.value).toBe("all");
    expect(toasts).toEqual([
      expect.objectContaining({ title: "dms.table.views.unavailable_title" }),
    ]);
  });

  it("opens the default view on a first visit only", async () => {
    const first = await mountViews({ views: VIEWS });
    expect(first.api.activeViewId.value).toBe("all");
    app?.unmount();
    const later = await mountViews({
      views: VIEWS,
      preferences: { "tables.content.page.activeView": "" },
    });
    expect(later.api.activeViewId.value).toBe(undefined);
  });

  it("marks a view modified until it is reset", async () => {
    const { api, state } = await mountViews({
      views: VIEWS,
      query: { view: "mine" },
    });
    expect(api.isModified.value).toBe(false);
    state.globalFilter.value = "printer";
    await nextTick();
    expect(api.isModified.value).toBe(true);
    api.resetView();
    await nextTick();
    expect(state.globalFilter.value).toBe(undefined);
    expect(api.isModified.value).toBe(false);
  });

  it("saves the current state as a view of the user's own, served to them only", async () => {
    const { api, state, preferences } = await mountViews({
      views: VIEWS,
      viewName: " Printers ",
      preferences: {
        "tables.content.page.userViews": [
          { id: "user-x", label: "Theirs", ownerId: "u2" },
        ],
      },
    });
    state.globalFilter.value = "printer";
    await api.saveAsNewView();
    await nextTick();
    const saved = api.activeView.value;
    expect(saved).toMatchObject({
      label: "Printers",
      isUserView: true,
      search: "printer",
    });
    expect(api.items.value.map((view) => view.label)).toEqual([
      "All",
      "i18n:tickets.mine",
      "Printers",
    ]);
    expect(
      (preferences.get("tables.content.page.userViews") as unknown[]).length,
    ).toBe(2);

    state.density.value = "compact";
    await nextTick();
    expect(api.isModified.value).toBe(true);
    api.saveView();
    await nextTick();
    expect(api.isModified.value).toBe(false);

    api.deleteView(saved!.id);
    await nextTick();
    expect(api.activeViewId.value).toBe(undefined);
    expect(api.items.value).toHaveLength(2);
  });

  it("never saves over a view the module declares", async () => {
    const { api, state } = await mountViews({
      views: VIEWS,
      query: { view: "mine" },
    });
    state.globalFilter.value = "printer";
    api.saveView();
    api.resetView();
    await nextTick();
    expect(state.globalFilter.value).toBe(undefined);
  });
});

describe("table views strip", () => {
  let app: App | undefined;

  const mountStrip = (props: Record<string, unknown>) => {
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
    const pills = [...container.querySelectorAll("button[aria-pressed]")];
    expect(pills.map((pill) => pill.textContent?.trim())).toEqual([
      "All workspaces",
      "Past due 3",
      "Mine",
    ]);
    expect(pills[0]!.getAttribute("aria-pressed")).toBe("true");
    (pills[1] as HTMLElement).click();
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
    (
      container.querySelector(
        'button[aria-label="dms.table.views.delete"]',
      ) as HTMLElement
    ).click();
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
