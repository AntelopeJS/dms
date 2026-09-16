import type {
  LocationQuery,
  LocationQueryRaw,
} from "#dms-inertia/frontend-module";

export const ACCOUNTS_LIST_ROUTE = "/auth/accounts";
export const FROM_ACCOUNTS_QUERY = { from: "accounts" };

export function isFromAccountsList(query: LocationQuery): boolean {
  const raw = query.from;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === FROM_ACCOUNTS_QUERY.from;
}

export function withAccountsFlag(
  currentQuery: LocationQuery,
  targetQuery: LocationQueryRaw = {},
): LocationQueryRaw {
  return isFromAccountsList(currentQuery)
    ? { ...targetQuery, ...FROM_ACCOUNTS_QUERY }
    : targetQuery;
}
