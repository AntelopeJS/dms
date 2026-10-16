import type {
  PaginationState,
  SortingState,
  VisibilityState,
} from "@tanstack/vue-table";
import type { Ref } from "vue";
import type {
  TableViewViewConfig,
  TableViewViewsConfig,
} from "../../../composables/table-view/types";
import type {
  TableDensity,
  TableFilter,
} from "../../components/table/Table.vue";
import {
  isSameTableState,
  newUserViewId,
  readTableUrlKey,
  snapshotViewState,
  type TableStateDefaults,
  type TableStateSnapshot,
  type TableUrlScope,
  type UserTableView,
  viewSnapshot,
} from "./utils/views";
import type { TablePreferences } from "./useTablePreferences";

/** The table's state a view reads and sets. */
export interface TableViewsState {
  columnFilters: Ref<TableFilter[]>;
  globalFilter: Ref<string | undefined>;
  sorting: Ref<SortingState>;
  columnVisibility: Ref<VisibilityState>;
  columnOrder: Ref<string[]>;
  display: Ref<string>;
  density: Ref<TableDensity>;
  pagination: Ref<PaginationState>;
}

export interface TableViewsOptions {
  views: TableViewViewsConfig | undefined;
  defaults: TableStateDefaults;
  state: TableViewsState;
  /** The table's preferences (`useTablePreferences`). */
  preferences: TablePreferences;
  urlScope: TableUrlScope;
}

/** A view as the table lists it. */
export interface ResolvedTableView extends TableViewViewConfig {
  /** Saved by the user, who may update or delete it. */
  isUserView: boolean;
}

export const VIEW_URL_KEY = "view";
const NO_VIEW = "";
const VIEW_NAME_FIELD = "label";

/**
 * The views of a table view: the module's and the user's own, the one open,
 * whether the table moved away from it, and the ways back (Reset) or forward
 * (Save, Save as new view). Opening a view always applies its whole state:
 * a change made to a view is not kept when another is opened.
 */
export function useTableViews(options: TableViewsOptions) {
  const { views, defaults, state, preferences, urlScope } = options;
  const { user } = useDmsUserSession();
  const { t } = useI18n();
  const { processI18n } = useTranslation();
  const toast = useToast();
  const { confirm } = useConfirm();
  const route = useDmsRoute();

  const userId = computed(() => user.value?._id as string | undefined);
  // Kept in the browser: none on the server, restored once mounted.
  const storedUserViews = ref<UserTableView[]>([]);
  preferences.restore("userViews", storedUserViews, Array.isArray);
  const ownUserViews = computed(() =>
    views?.userViews && userId.value
      ? storedUserViews.value.filter((view) => view.ownerId === userId.value)
      : [],
  );

  const items = computed<ResolvedTableView[]>(() => [
    ...(views?.items ?? []).map((view) => ({
      ...view,
      label: processI18n(view.label),
      isUserView: false,
    })),
    ...ownUserViews.value.map(({ ownerId: _ownerId, ...view }) => ({
      ...view,
      isUserView: true,
    })),
  ]);
  const findView = (id: string | undefined) =>
    id ? items.value.find((view) => view.id === id) : undefined;

  const currentSnapshot = (): TableStateSnapshot => ({
    filters: state.columnFilters.value,
    search: state.globalFilter.value ?? "",
    sorting: state.sorting.value,
    visibility: state.columnVisibility.value,
    order: state.columnOrder.value,
    display: state.display.value,
    density: state.density.value,
  });

  const applySnapshot = (snapshot: TableStateSnapshot) => {
    state.columnFilters.value = snapshot.filters.map((filter) => ({
      ...filter,
    }));
    state.globalFilter.value = snapshot.search || undefined;
    state.sorting.value = snapshot.sorting;
    state.columnVisibility.value = snapshot.visibility;
    state.columnOrder.value = snapshot.order;
    state.display.value = snapshot.display;
    state.density.value = snapshot.density;
    state.pagination.value = { ...state.pagination.value, pageIndex: 0 };
  };

  const activeViewId = ref<string | undefined>();
  const activeView = computed(() => findView(activeViewId.value));

  /** Opens a view, or the table's own default state without one. */
  const openView = (id: string | undefined) => {
    const view = findView(id);
    activeViewId.value = view?.id;
    applySnapshot(viewSnapshot(view, defaults));
  };

  // Read once, on arrival: a view named by the URL wins over the state kept
  // from the last visit; a view the caller may not open falls back to the
  // default one, with a word (on the client, once mounted). The user's views
  // are kept in the browser, so a view that is not the module's is resolved
  // once mounted.
  const urlView = readTableUrlKey(route.query, urlScope, VIEW_URL_KEY);
  const persistedViewId = preferences.get<string | undefined>(
    "activeView",
    undefined,
  );
  let isUrlViewUnavailable = false;
  let isUrlViewPending = false;
  let isOpenedOnArrival = false;
  if (urlView.value && findView(urlView.value)) {
    openView(urlView.value);
    isOpenedOnArrival = true;
  } else if (urlView.value) {
    isUrlViewPending = true;
  } else if (persistedViewId === undefined) {
    if (views?.defaultView) openView(views.defaultView);
    isOpenedOnArrival = !!views?.defaultView;
  } else {
    activeViewId.value = findView(persistedViewId)?.id;
  }

  // The browser-only state (order, density) is restored over the view opened
  // in setup: the view's own wins, as it did when everything was read there.
  const reapplyBrowserState = () => {
    const snapshot = viewSnapshot(activeView.value, defaults);
    state.columnOrder.value = snapshot.order;
    state.density.value = snapshot.density;
  };

  const arriveOnceMounted = () => {
    if (isUrlViewPending) {
      isUrlViewUnavailable = !findView(urlView.value);
      openView(isUrlViewUnavailable ? views?.defaultView : urlView.value);
    } else if (isOpenedOnArrival) {
      reapplyBrowserState();
    } else if (persistedViewId && !activeViewId.value) {
      activeViewId.value = findView(persistedViewId)?.id;
    }
  };

  onMounted(() => {
    arriveOnceMounted();
    if (urlView.ignoredShortKey && import.meta.env.DEV) {
      console.warn(
        `[DMS] "?${VIEW_URL_KEY}=" is ignored on a page with several table views: name the table, "?${urlScope.tableId}.${VIEW_URL_KEY}=".`,
      );
    }
    if (!isUrlViewUnavailable) return;
    toast.add({
      title: t("dms.table.views.unavailable_title"),
      description: t("dms.table.views.unavailable_description"),
      color: Color.warning,
      icon: "i-ph-eye-slash",
    });
  });

  watch(activeViewId, (id) => {
    preferences.set<string | undefined>("activeView", id ?? NO_VIEW, undefined);
  });

  const isModified = computed(() => {
    const view = activeView.value;
    if (!view) return false;
    return !isSameTableState(
      currentSnapshot(),
      viewSnapshot(view, defaults),
      defaults.columnOrder,
    );
  });

  const writeUserViews = (next: UserTableView[]) => {
    storedUserViews.value = next;
    preferences.set("userViews", next, []);
  };

  /** Back to the open view's own state. */
  const resetView = () => openView(activeViewId.value);

  /** Keeps the current state in the open view, one of the user's own. */
  const saveView = () => {
    const view = activeView.value;
    if (!view?.isUserView) return;
    const state = snapshotViewState(currentSnapshot());
    writeUserViews(
      storedUserViews.value.map((stored) =>
        stored.id === view.id ? { ...stored, ...state } : stored,
      ),
    );
  };

  const askViewName = async (): Promise<string | undefined> => {
    let name: string | undefined;
    const isConfirmed = await confirm({
      title: t("dms.table.views.save_as_title"),
      description: t("dms.table.views.save_as_description"),
      icon: "i-ph-bookmark-simple",
      color: "primary",
      confirmLabel: t("dms.table.views.save_as_confirm"),
      fields: [
        {
          id: VIEW_NAME_FIELD,
          label: t("dms.table.views.name_label"),
          type: "string",
          required: true,
          component: {
            componentName: "dms-input-text",
            options: { placeholder: t("dms.table.views.name_placeholder") },
          },
        },
      ],
      onConfirm: async (values) => {
        name = String(values[VIEW_NAME_FIELD] ?? "").trim() || undefined;
      },
    });
    return isConfirmed ? name : undefined;
  };

  /** Saves the current state as a new view of the user's, then opens it. */
  const saveAsNewView = async () => {
    const owner = userId.value;
    if (!views?.userViews || !owner) return;
    const label = await askViewName();
    if (!label) return;
    const view: UserTableView = {
      id: newUserViewId(),
      label,
      ownerId: owner,
      ...snapshotViewState(currentSnapshot()),
    };
    writeUserViews([...storedUserViews.value, view]);
    activeViewId.value = view.id;
  };

  /** Deletes one of the user's views; the table keeps its state. */
  const deleteView = (id: string) => {
    if (!findView(id)?.isUserView) return;
    writeUserViews(storedUserViews.value.filter((view) => view.id !== id));
    if (activeViewId.value === id) activeViewId.value = undefined;
  };

  return {
    items,
    activeViewId,
    activeView,
    isModified,
    canSaveViews: !!views?.userViews,
    openView,
    resetView,
    saveView,
    saveAsNewView,
    deleteView,
  };
}

export type TableViewsApi = ReturnType<typeof useTableViews>;
