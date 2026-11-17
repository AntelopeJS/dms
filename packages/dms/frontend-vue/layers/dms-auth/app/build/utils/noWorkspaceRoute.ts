import {
  hasDmsPage,
  type LocationQueryRaw,
  type RouteLocationRaw,
} from "#dms/frontend-module";

const NO_WORKSPACE_PATH = "/auth/no-workspace";
const NOT_A_MEMBER_PATH = "/auth/not-a-member";

/**
 * Where a sign-in that found no workspace for the account goes: the page a
 * module serves on `/auth/no-workspace`, handed the tenant assignment in
 * `query`, or else the core screen, which needs no token.
 */
export function noWorkspaceRoute(query: LocationQueryRaw): RouteLocationRaw {
  return hasDmsPage(NO_WORKSPACE_PATH)
    ? { path: NO_WORKSPACE_PATH, query }
    : { path: NOT_A_MEMBER_PATH };
}
