/** @vitest-environment jsdom */
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
import {
  PHONE_VIEWPORT_QUERY,
  useMobileDisplay,
} from "../layers/dms-ui/app/entries/composables/table-view/useMobileDisplay";
import { useTableViews } from "../layers/dms-ui/app/entries/composables/table-view/useTableViews";
import type { TablePreferences } from "../layers/dms-ui/app/entries/composables/table-view/useTablePreferences";
import { linkedArrivalPreferences } from "../layers/dms-ui/app/entries/composables/table-view/utils/linkedArrival";
import { type TableStateDefaults } from "../layers/dms-ui/app/entries/composables/table-view/utils/views";
import type { TableViewViewsConfig } from "../layers/dms-ui/app/composables/table-view/types";
import type {
  TableDensity,
  TableFilter,
} from "../layers/dms-ui/app/entries/components/table/Table";
import type { ConfirmOptions } from "../layers/dms-ui/app/composables/confirm/types";
import type { ToastProps } from "@nuxt/ui";

import { pinnedStatus, DEFAULTS } from "./helpers/table-view-views-fixtures";

interface HarnessOptions {
  views: TableViewViewsConfig;
  query?: Record<string, string>;
  preferences?: Record<string, Parameters<TablePreferences["set"]>[1]>;
  userId?: string;
  viewName?: string;
  /** Arrived through a link naming what the table lists. */
  isLinked?: boolean;
  /** The answer to a confirmation without fields (a deletion). */
  isConfirmed?: boolean;
  /** Wires a phone's `mobileDisplay` after the views, as the table view does. */
  mobileDisplay?: string;
}

describe("useTableViews", () => {
  const fixture = createTableViewViewsFixture();
  registerViewArrivalTests(fixture);
  registerViewDefaultsAndSavingTests(fixture);
  registerViewClosingTests(fixture);
  registerMobileAndDeclaredViewTests(fixture);
});

function createTableViewViewsFixture() {
  let app: App | undefined;
  let toasts: unknown[];
  let dialogs: ConfirmOptions[];

  const mountViews = async (options: HarnessOptions) => {
    const preferences = new Map<string, unknown>(
      Object.entries(options.preferences ?? {}),
    );

    const restores: Array<() => void> = [];
    const tablePreferences = createRestorablePreferences(preferences, restores);
    vi.stubGlobal("useDmsUserSession", () => ({
      user: ref({ _id: options.userId ?? "u1" }),
    }));
    vi.stubGlobal("useDmsRoute", () => ({ query: options.query ?? {} }));
    vi.stubGlobal("useConfirm", () => ({
      confirm: async (dialog: ConfirmOptions) => {
        dialogs.push(dialog);
        if (!dialog.onConfirm) return options.isConfirmed ?? true;
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
    const displayDefault = ref(DEFAULTS.display);
    const defaults: TableStateDefaults = {
      ...DEFAULTS,
      get display() {
        return displayDefault.value;
      },
    };
    let api: ReturnType<typeof useTableViews> | undefined;
    app = createApp(
      defineComponent({
        setup() {
          onMounted(() => restores.forEach((restore) => restore()));

          tablePreferences.restore("density", state.density);
          tablePreferences.restore("columnOrder", state.columnOrder);
          api = useTableViews({
            views: options.views,
            defaults,
            state,
            preferences: options.isLinked
              ? linkedArrivalPreferences(tablePreferences)
              : tablePreferences,
            urlScope: { tableId: "content", isSoleTableView: true },
          });
          useMobileDisplay({
            mobileDisplay: options.mobileDisplay,
            defaultDisplay: displayDefault,
            offered: DEFAULTS.displays,
            display: state.display,
            activeView: api.activeView,
            isDisplayChosen: () => false,
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
    dialogs = [];
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
      add: (toast: ToastProps) => toasts.push(toast),
    }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });
  return {
    mountViews,
    VIEWS,
    get toasts() {
      return toasts;
    },
    get app() {
      return app;
    },
    get dialogs() {
      return dialogs;
    },
  };
}

function createRestorablePreferences(
  preferences: Map<string, unknown>,
  restores: Array<() => void>,
): TablePreferences {
  return {
    // SAFETY: The preference API's generic read uses the field's stored type; these fixtures preserve that correlation.
    get: <V>(field: string, fallback: V) =>
      (preferences.has(field) ? preferences.get(field) : fallback) as V,
    set: (field, value) => {
      preferences.set(field, value);
    },
    restore: (field, state) => {
      restores.push(() => {
        if (preferences.has(field)) {
          // SAFETY: restore receives the ref for the same preference field stored in this map.
          state.value = preferences.get(field) as typeof state.value;
        }
      });
    },
  };
}

function registerViewArrivalTests(
  fixture: ReturnType<typeof createTableViewViewsFixture>,
) {
  it("opens the view the URL names, over the state kept from the last visit", async () => {
    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "mine" },
      preferences: { activeView: "all" },
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
    const { api } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { "content.view": "user-of-someone-else" },
    });
    expect(api.activeViewId.value).toBe("all");
    expect(fixture.toasts).toEqual([
      expect.objectContaining({ title: "dms.table.views.unavailable_title" }),
    ]);
  });

  it("opens a user view the URL names once its views are restored in the browser", async () => {
    const { api } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "user-mine" },
      preferences: {
        userViews: [
          { id: "user-mine", label: "Mine", ownerId: "u1", search: "x" },
        ],
      },
    });
    expect(api.activeViewId.value).toBe("user-mine");
    expect(fixture.toasts).toEqual([]);
  });

  it("restores the browser-only state, a view opened on arrival keeping its own", async () => {
    const opened = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "all" },
      preferences: { density: "compact" },
    });
    expect(opened.state.density.value).toBe("default");
    fixture.app?.unmount();

    const kept = await fixture.mountViews({
      views: fixture.VIEWS,
      preferences: { density: "compact", activeView: "" },
    });
    expect(kept.state.density.value).toBe("compact");
  });

  it("brings the kept view's search back with it", async () => {
    const { api, state } = await fixture.mountViews({
      views: {
        ...fixture.VIEWS,
        items: [
          ...fixture.VIEWS.items,
          { id: "printers", label: "P", search: "T-13" },
        ],
      },
      preferences: { activeView: "printers" },
    });
    expect(api.activeViewId.value).toBe("printers");
    expect(state.globalFilter.value).toBe("T-13");
  });

  it("brings a kept user view's search back once its views are restored", async () => {
    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
      preferences: {
        activeView: "user-mine",
        userViews: [
          { id: "user-mine", label: "Mine", ownerId: "u1", search: "T-13" },
        ],
      },
    });
    expect(api.activeViewId.value).toBe("user-mine");
    expect(state.globalFilter.value).toBe("T-13");
  });
}

function registerViewDefaultsAndSavingTests(
  fixture: ReturnType<typeof createTableViewViewsFixture>,
) {
  it("opens on the defaults, not the kept view, when a link names the table's state", async () => {
    const { api, preferences } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { tab: "closed" },
      preferences: { activeView: "mine" },
      isLinked: true,
    });
    expect(api.activeViewId.value).toBe("all");

    expect(preferences.get("activeView")).toBe("mine");
  });

  it("opens the default view on a first visit only", async () => {
    const first = await fixture.mountViews({ views: fixture.VIEWS });
    expect(first.api.activeViewId.value).toBe("all");
    fixture.app?.unmount();
    const later = await fixture.mountViews({
      views: fixture.VIEWS,
      preferences: { activeView: "" },
    });
    expect(later.api.activeViewId.value).toBe(undefined);
  });

  it("marks a view modified until it is reset", async () => {
    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
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
    const { api, state, preferences } = await fixture.mountViews({
      views: fixture.VIEWS,
      viewName: " Printers ",
      preferences: {
        userViews: [{ id: "user-x", label: "Theirs", ownerId: "u2" }],
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
    expect(preferences.get("userViews")).toHaveLength(2);

    state.density.value = "compact";
    await nextTick();
    expect(api.isModified.value).toBe(true);
    api.saveView();
    await nextTick();
    expect(api.isModified.value).toBe(false);

    await api.deleteView(saved!.id);
    await nextTick();
    expect(api.activeViewId.value).toBe(undefined);
    expect(api.items.value).toHaveLength(2);
  });
}

function registerViewClosingTests(
  fixture: ReturnType<typeof createTableViewViewsFixture>,
) {
  it("closes the open view when it is clicked again, back to the table's defaults", async () => {
    const { api, state } = await fixture.mountViews({
      views: {
        ...fixture.VIEWS,
        defaultView: undefined,
        items: fixture.VIEWS.items.slice(1),
      },
      query: { view: "mine" },
    });
    expect(state.sorting.value).toEqual([{ id: "title", desc: false }]);
    api.selectView("mine");
    await nextTick();
    expect(api.activeViewId.value).toBe(undefined);
    expect(api.isModified.value).toBe(false);
    expect(state.columnFilters.value).toEqual([{ ...pinnedStatus }]);
    expect(state.sorting.value).toEqual(DEFAULTS.sorting);
    api.selectView("mine");
    expect(api.activeViewId.value).toBe("mine");
  });

  it("opens no view on a link with an empty view key, over the default view", async () => {
    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "" },
      preferences: { activeView: "mine" },
      isLinked: true,
    });
    expect(api.activeViewId.value).toBe(undefined);
    expect(state.sorting.value).toEqual(DEFAULTS.sorting);

    api.openLinkedView({ view: "mine" });
    expect(api.activeViewId.value).toBe("mine");
    api.openLinkedView({ view: "" });
    expect(api.activeViewId.value).toBe(undefined);
    expect(state.columnFilters.value).toEqual([{ ...pinnedStatus }]);
  });

  it("asks before deleting a view, and leaves the deleted open view's state behind", async () => {
    const userViews = [
      { id: "user-printers", label: "Printers", ownerId: "u1", search: "T-13" },
    ];
    const declined = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "user-printers" },
      preferences: { userViews },
      isConfirmed: false,
    });
    await declined.api.deleteView("user-printers");
    expect(fixture.dialogs).toEqual([
      expect.objectContaining({ title: "dms.table.views.delete_title" }),
    ]);
    expect(declined.api.activeViewId.value).toBe("user-printers");
    expect(declined.state.globalFilter.value).toBe("T-13");
    fixture.app?.unmount();

    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "user-printers" },
      preferences: { userViews },
    });
    expect(state.globalFilter.value).toBe("T-13");
    await api.deleteView("user-printers");
    await nextTick();
    expect(api.items.value.map((view) => view.id)).toEqual(["all", "mine"]);
    expect(api.activeViewId.value).toBe(undefined);
    expect(state.globalFilter.value).toBe(undefined);
    expect(state.sorting.value).toEqual(DEFAULTS.sorting);
  });
}

function registerMobileAndDeclaredViewTests(
  fixture: ReturnType<typeof createTableViewViewsFixture>,
) {
  describe("on a phone, with a mobileDisplay", () => {
    beforeEach(() => {
      // SAFETY: useMobileDisplay only reads matches from the MediaQueryList returned by this fixture.
      window.matchMedia = vi.fn((query: string) => ({
        matches: query === PHONE_VIEWPORT_QUERY,
      })) as typeof window.matchMedia;
    });

    it("opens the default view on the phone's display when the view sets none", async () => {
      const { api, state } = await fixture.mountViews({
        views: fixture.VIEWS,
        mobileDisplay: "grouped",
      });
      expect(api.activeViewId.value).toBe("all");
      expect(state.display.value).toBe("grouped");
      expect(api.isModified.value).toBe(false);
      api.openView("mine");
      await nextTick();
      expect(state.display.value).toBe("grouped");
    });

    it("keeps the display an open view fixes", async () => {
      const { state } = await fixture.mountViews({
        views: {
          ...fixture.VIEWS,
          items: [{ id: "all", label: "All", display: "table" }],
        },
        mobileDisplay: "grouped",
      });
      expect(state.display.value).toBe("table");
    });

    it("opens a view the URL names without a display on the phone's display", async () => {
      const { api, state } = await fixture.mountViews({
        views: fixture.VIEWS,
        query: { view: "mine" },
        mobileDisplay: "grouped",
      });
      expect(api.activeViewId.value).toBe("mine");
      expect(state.display.value).toBe("grouped");
    });
  });

  it("never saves over a view the module declares", async () => {
    const { api, state } = await fixture.mountViews({
      views: fixture.VIEWS,
      query: { view: "mine" },
    });
    state.globalFilter.value = "printer";
    api.saveView();
    api.resetView();
    await nextTick();
    expect(state.globalFilter.value).toBe(undefined);
  });
}
