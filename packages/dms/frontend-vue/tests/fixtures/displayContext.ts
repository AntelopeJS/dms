import type {
  TableViewDisplayActions,
  TableViewDisplayContext,
  TableViewDisplayPagination,
  TableViewDisplaySelection,
} from "../../layers/dms-ui/app/composables/table-view/types/display";

const nothing = () => undefined;

type DisplayContextParts<T> = Omit<
  Partial<TableViewDisplayContext<T>>,
  "selection" | "pagination" | "actions"
> & {
  selection?: Partial<TableViewDisplaySelection>;
  pagination?: Partial<TableViewDisplayPagination>;
  actions?: Partial<TableViewDisplayActions<T>>;
};

/** A complete display context: `parts` replace the idle defaults, member by member. */
export function displayContext<T = TableViewDisplayContext["items"][number]>(
  parts: DisplayContextParts<T> = {},
): TableViewDisplayContext<T> {
  const { selection, pagination, actions, ...context } = parts;
  return {
    items: [],
    columns: [],
    loading: false,
    firstPageLoading: false,
    presenceByRow: {},
    rowIdKey: "_id",
    location: "/api/rows",
    query: {},
    refresh: nothing,
    ...context,
    selection: {
      ids: [],
      isSelected: () => false,
      toggle: nothing,
      toggleAll: nothing,
      clear: nothing,
      ...selection,
    },
    pagination: {
      pageIndex: 0,
      pageSize: 10,
      total: 0,
      setPage: nothing,
      setPageSize: nothing,
      mode: "pages",
      hasMore: false,
      loadMore: nothing,
      ...pagination,
    },
    actions: {
      canAdd: false,
      canEdit: false,
      canDelete: false,
      canDetails: false,
      canEditRow: () => false,
      canDeleteRow: () => false,
      add: nothing,
      edit: nothing,
      delete: nothing,
      duplicate: nothing,
      details: nothing,
      open: nothing,
      custom: nothing,
      customFor: () => [],
      ...actions,
    },
  };
}
