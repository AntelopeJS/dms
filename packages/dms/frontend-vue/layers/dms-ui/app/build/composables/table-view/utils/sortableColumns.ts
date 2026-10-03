import type { SortingState } from "@tanstack/vue-table";

/** The part of a column config sorting depends on. */
interface SortableColumnLike {
  id?: string;
  accessorKey?: string;
  /** Backend `@Sortable()`: the list route refuses any other sort key. */
  enableSorting?: boolean;
}

/** A table view's declared default sort (`defaultSort` option). */
export interface DefaultSortConfig {
  field: string;
  desc?: boolean;
}

/** The data API's refusal of a sort key not declared `@Sortable()`. */
const UNSORTABLE_FIELD_PATTERN = /not sortable/i;
const HTTP_BAD_REQUEST = 400;

/**
 * Whether the list route accepts this column as a sort key. The backend sends
 * `enableSorting` for every column; a column config without it (built by hand
 * on the frontend) keeps TanStack's default, sortable.
 */
export const isColumnSortable = (column: SortableColumnLike): boolean =>
  column.enableSorting !== false;

/** Ids of the columns the list route accepts as sort keys. */
export const sortableColumnIds = (
  columns: readonly SortableColumnLike[],
): Set<string> =>
  new Set(
    columns
      .filter(isColumnSortable)
      .map((column) => column.id ?? column.accessorKey)
      .filter((id): id is string => !!id),
  );

/**
 * The sort the list route can serve: one column (the route sorts on a single
 * key), and only a sortable one. A saved preference or a pasted table config
 * may name a column that is not, or no longer, sortable: it is dropped rather
 * than sent to a route that would refuse the whole list.
 */
export const sanitizeSorting = (
  sorting: SortingState | null | undefined,
  sortable: ReadonlySet<string>,
): SortingState => {
  const [first] = Array.isArray(sorting) ? sorting : [];
  if (!first || typeof first.id !== "string" || !sortable.has(first.id)) {
    return [];
  }
  return [{ id: first.id, desc: first.desc === true }];
};

/** Whether two sorting states request the same order. */
export const isSameSorting = (a: SortingState, b: SortingState): boolean =>
  a.length === b.length &&
  a.every(
    (entry, index) =>
      entry.id === b[index]?.id && !!entry.desc === !!b[index]?.desc,
  );

/**
 * Creation-date columns a table view without a declared default sort is
 * listed by, newest first, when one is sortable: without any sort the list
 * comes in the database's natural order, which no database guarantees stable.
 */
export const STABLE_DEFAULT_SORT_FIELDS = ["createdAt", "created_at"] as const;

/**
 * The default sort a table view lists by: the declared one, or none when it
 * names a column the list route cannot sort on (with a warning in
 * development: the table view config is wrong, not the user's choice). A table
 * view declaring none falls back to its sortable creation date, newest first.
 */
export const resolveDefaultSortConfig = (
  defaultSort: DefaultSortConfig | undefined,
  sortable: ReadonlySet<string>,
  warn: (message: string) => void = () => {},
): DefaultSortConfig | undefined => {
  if (defaultSort?.field) {
    if (sortable.has(defaultSort.field)) {
      return { field: defaultSort.field, desc: defaultSort.desc ?? false };
    }
    warn(
      `[TableView] defaultSort "${defaultSort.field}" is ignored: the column is not sortable (declare it @Sortable() on the data API).`,
    );
    return undefined;
  }
  const field = STABLE_DEFAULT_SORT_FIELDS.find((id) => sortable.has(id));
  return field ? { field, desc: true } : undefined;
};

/** The sorting state of a default sort. */
export const defaultSortingState = (
  defaultSort: DefaultSortConfig | undefined,
): SortingState =>
  defaultSort
    ? [{ id: defaultSort.field, desc: defaultSort.desc ?? false }]
    : [];

/** {@link resolveDefaultSortConfig}, as a sorting state. */
export const resolveDefaultSort = (
  defaultSort: DefaultSortConfig | undefined,
  sortable: ReadonlySet<string>,
  warn?: (message: string) => void,
): SortingState =>
  defaultSortingState(resolveDefaultSortConfig(defaultSort, sortable, warn));

/** Whether the list is sorted by its default sort (the user sorted nothing). */
export const isDefaultSorting = (
  sorting: SortingState,
  defaultSort: DefaultSortConfig | undefined,
): boolean =>
  !!defaultSort && isSameSorting(sorting, defaultSortingState(defaultSort));

/**
 * What a column header shows of the sort:
 * - `none`: the column cannot be sorted (title only, no icon, no button);
 * - `idle`: sortable, not sorted (neutral ↕);
 * - `default`: sorted by the table's default sort (neutral arrow);
 * - `active`: sorted by the user (accent arrow, emphasised title).
 */
export type HeaderSortCue = "none" | "idle" | "default" | "active";

export const headerSortCue = (state: {
  canSort: boolean;
  sorted: false | "asc" | "desc";
  isDefaultSorting: boolean;
}): HeaderSortCue => {
  if (!state.canSort) return "none";
  if (!state.sorted) return "idle";
  return state.isDefaultSorting ? "default" : "active";
};

/** How a column's values are ordered, for the direction labels. */
export type SortValueKind = "number" | "date" | "text";

const NUMBER_SORT_TYPE_IDS = new Set(["number", "price", "percentage"]);
const DATE_SORT_TYPE_IDS = new Set(["date", "datetime", "relative_date"]);

export const sortValueKind = (typeId: string | undefined): SortValueKind => {
  if (typeId && NUMBER_SORT_TYPE_IDS.has(typeId)) return "number";
  if (typeId && DATE_SORT_TYPE_IDS.has(typeId)) return "date";
  return "text";
};

/** i18n key of a sort direction label ("lowest → highest", "A → Z"…). */
export const sortDirectionLabelKey = (
  kind: SortValueKind,
  desc: boolean,
): string => `dms.sort.direction.${kind}.${desc ? "desc" : "asc"}`;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const statusOf = (error: Record<string, unknown>): number | undefined => {
  const response = isObject(error.response) ? error.response : undefined;
  const status = error.statusCode ?? error.status ?? response?.status;
  return typeof status === "number" ? status : undefined;
};

const messagesOf = (error: Record<string, unknown>): string[] => {
  const { data } = error;
  return [
    typeof data === "string" ? data : undefined,
    isObject(data) && typeof data.message === "string"
      ? data.message
      : undefined,
    typeof error.statusMessage === "string" ? error.statusMessage : undefined,
    typeof error.message === "string" ? error.message : undefined,
  ].filter((message): message is string => !!message);
};

/**
 * Whether a failed list request was refused for its sort key (`400 Field is
 * not sortable.`): a sort the route never accepted, or a column whose
 * `@Sortable()` was removed since the page was loaded.
 */
export const isUnsortableFieldError = (error: unknown): boolean => {
  if (!isObject(error)) return false;
  const status = statusOf(error);
  if (status !== undefined && status !== HTTP_BAD_REQUEST) return false;
  return messagesOf(error).some((message) =>
    UNSORTABLE_FIELD_PATTERN.test(message),
  );
};
