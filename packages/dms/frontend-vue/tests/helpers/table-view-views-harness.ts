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
import { afterEach, beforeEach, vi } from "vitest";
import type { ToastProps } from "@nuxt/ui";
import { useMobileDisplay } from "../../layers/dms-ui/app/entries/composables/table-view/useMobileDisplay";
import { useTableViews } from "../../layers/dms-ui/app/entries/composables/table-view/useTableViews";
import type { TablePreferences } from "../../layers/dms-ui/app/entries/composables/table-view/useTablePreferences";
import { linkedArrivalPreferences } from "../../layers/dms-ui/app/entries/composables/table-view/utils/linkedArrival";
import type { TableStateDefaults } from "../../layers/dms-ui/app/entries/composables/table-view/utils/views";
import type { TableViewViewsConfig } from "../../layers/dms-ui/app/composables/table-view/types";
import type {
  TableDensity,
  TableFilter,
} from "../../layers/dms-ui/app/entries/components/table/TableRoot";
import type { ConfirmOptions } from "../../layers/dms-ui/app/composables/confirm/types";
import { DEFAULTS } from "./table-view-views-fixtures";

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

export function createTableViewViewsFixture() {
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
    // SAFETY: holds when the V a caller requests for a field is the type of the value `preferences` stores under it; a field absent from the map returns the caller's fallback, which is a V.
    get: <V>(field: string, fallback: V) =>
      (preferences.has(field) ? preferences.get(field) : fallback) as V,
    set: (field, value) => {
      preferences.set(field, value);
    },
    restore: (field, state) => {
      restores.push(() => {
        if (preferences.has(field)) {
          // SAFETY: holds when the state ref passed to restore holds the type of the value `preferences` stores under that same field.
          state.value = preferences.get(field) as typeof state.value;
        }
      });
    },
  };
}
