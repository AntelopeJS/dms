import { RegisterPermission } from "@antelopejs/interface-dms/permissions";
import { RegisterPermissionsResolver } from "@antelopejs/interface-dms/permissions-resolver";
import { componentsSection } from "../sections";

/** A permission tied to no page: it gates the "Export report" button. */
export const EXPORT_REPORTS_PERMISSION_ID = "playground.reports.export";
/** Every permission under the charts category, which the free plan drops. */
export const CHARTS_PERMISSION_PREFIX = `${componentsSection.fullId}.charts`;

RegisterPermission(EXPORT_REPORTS_PERMISSION_ID, {
  id: EXPORT_REPORTS_PERMISSION_ID,
  title: "Export reports",
  description: "Registered with RegisterPermission, outside any page",
  icon: "i-ph-export",
});

// Workspaces switched to the "free plan" by the permissions page.
const freePlanWorkspaces = new Set<string>();

export function isOnFreePlan(tenantId: string): boolean {
  return freePlanWorkspaces.has(tenantId);
}

export function toggleFreePlan(tenantId: string): boolean {
  const free = !freePlanWorkspaces.has(tenantId);
  if (free) {
    freePlanWorkspaces.add(tenantId);
  } else {
    freePlanWorkspaces.delete(tenantId);
  }
  return free;
}

function withoutCharts(permissions: Set<string>): Set<string> {
  return new Set(
    [...permissions].filter(
      (permission) => !permission.startsWith(CHARTS_PERMISSION_PREFIX),
    ),
  );
}

// Reshapes what a role grants, per workspace: on the free plan, the charts
// demos leave the menu of every member whose role granted them. An owner
// holds `*`, which no prefix matches, so preview a role to see it.
RegisterPermissionsResolver({
  id: "playground-free-plan",
  order: 0,
  resolver: (_userId, tenantId, permissions) =>
    isOnFreePlan(tenantId) ? withoutCharts(permissions) : permissions,
});
