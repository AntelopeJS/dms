export enum SortDirection {
  asc = "asc",
  desc = "desc",
}

export interface TableQueryParams {
  search?: string;
  offset: number;
  limit: number;
  sortKey?: string;
  sortDirection?: SortDirection;
  showArchived?: boolean;
  /** Set when the filters keep no row: nothing is requested (see `buildTableQuery`). */
  noRows?: boolean;
  [key: `filter_${string}`]: string | number | undefined;
}
