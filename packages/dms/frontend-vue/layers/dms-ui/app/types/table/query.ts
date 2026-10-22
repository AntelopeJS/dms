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
  /** A list sends the key once per filter, which a row must all pass. */
  [key: `filter_${string}`]: string | string[] | number | undefined;
}
