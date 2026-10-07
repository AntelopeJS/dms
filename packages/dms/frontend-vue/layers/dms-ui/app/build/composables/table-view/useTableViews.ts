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
  /** Preference key of the table, for one of its settings. */
  preferenceKey: (suffix: string) => string;
  urlScope: TableUrlScope;
}

/** A view as the table lists it. */
export interface ResolvedTableView extends TableViewViewConfig {
  /** Saved by the user, who may update or delete it. */
  isUserView: boolean;
}

export const VIEW_URL_KEY = "view";
const ACTIVE_VIEW_PREFERENCE = "activeView";
const USER_VIEWS_PREFERENCE = "userViews";
const NO_VIEW = "";
const VIEW_NAME_FIELD = "label";

/**
 * The views of a table view: the module's and the user's own, the one open,
 * whether the table moved away from it, and the ways back (Reset) or forward
 * (Save, Save as new view). Opening a view always applies its whole state:
 * a change made to a view is not kept when another is opened.
 */
export function useTableViews(options: TableViewsOptions) {
  const { views, defaults, state, preferenceKey, urlScope } = options;
  const { getPreference, setPreference } = usePreferences();
  const { user } = useUserSession();
  const { t } = useI18n();
  const { processI18n } = useTranslation();
  const toast = useToast();
  const { confirm } = useConfirm();
  const route = useDmsRoute();

  const userId = computed(() => user.value?._id as string | undefined);
  const storedUserViews = ref<UserTableView[]>(
    getPreference<UserTableView[]>(preferenceKey(USER_VIEWS_PREFERENCE), []),
  );
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
  // default one, with a word (on the client, once mounted).
  const urlView = readTableUrlKey(route.query, urlScope, VIEW_URL_KEY);
  const persistedViewId = getPreference<string | undefined>(
    preferenceKey(ACTIVE_VIEW_PREFERENCE),
    undefined,
  );
  let isUrlViewUnavailable = false;
  if (urlView.value && findView(urlView.value)) {
    openView(urlView.value);
  } else if (urlView.value) {
    isUrlViewUnavailable = true;
    openView(views?.defaultView);
  } else if (persistedViewId === undefined) {
    if (views?.defaultView) openView(views.defaultView);
  } else {
    activeViewId.value = findView(persistedViewId)?.id;
  }

  onMounted(() => {
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
    setPreference(preferenceKey(ACTIVE_VIEW_PREFERENCE), id ?? NO_VIEW);
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
    setPreference(preferenceKey(USER_VIEWS_PREFERENCE), next);
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
