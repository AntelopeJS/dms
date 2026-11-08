import { hasDmsPage, type RouteLocationRaw } from "#dms/frontend-module";

const MODULE_PAGE_KEY = "auth/no-workspace";

/** What a sign-in that belongs to no workspace hands over. */
export interface TenantAssignmentHandover {
  token: string;
  provider?: string;
}

/**
 * Where a sign-in that belongs to no workspace goes: the page a module serves
 * at `/auth/no-workspace` (`dms-saas` opens a workspace there), given the
 * handover, or else the DMS's own `/auth/no-membership` notice, which needs
 * no token.
 */
export function tenantAssignmentLocation(
  handover: TenantAssignmentHandover,
): RouteLocationRaw {
  return hasDmsPage(MODULE_PAGE_KEY)
    ? { path: `/${MODULE_PAGE_KEY}`, query: { ...handover } }
    : { path: "/auth/no-membership" };
}
