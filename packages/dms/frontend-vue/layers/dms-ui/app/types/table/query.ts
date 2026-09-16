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
  [key: `filter_${string}`]: string | number | undefined;
}
