import { GetModel } from "@antelopejs/interface-database-decorators";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type { ActivityFeedItem } from "@antelopejs/interface-dms/base/activity-feed";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { pageMetadataByFullId } from "@antelopejs/interface-dms/page/registry";
import { userCanAccessPage } from "../../../implementations/dms/page";
import { loadAccountActivity } from "../users/account-activity-store";
import {
  ACTIVITY_PAGE_IDS,
  type ActivityPageRoutes,
  toActivityFeedItems,
} from "../users/account-activity-feed";
import type { BlockItems } from "./account-summary";

/** The route of each page the rows lead to that `user` can open. */
async function accessibleRoutes(
  user: User,
  tenantId: string,
): Promise<ActivityPageRoutes> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const roleModel = GetModel(RoleModel, tenantId);
  const routes = await Promise.all(
    Object.values(ACTIVITY_PAGE_IDS).map(async (fullId) => {
      const route = pageMetadataByFullId.get(fullId)?.pageInfo?.fullSlug;
      if (!route) return undefined;
      const canOpen = await userCanAccessPage(
        user,
        fullId,
        memberModel,
        roleModel,
        tenantId,
      );
      return canOpen ? ([fullId, route] as const) : undefined;
    }),
  );
  return Object.fromEntries(routes.filter((entry) => entry !== undefined));
}

/**
 * The activity feed of the settings overview: the signed-in user's latest
 * account events, each linking to the settings page it concerns when they
 * can open it.
 */
export async function loadOverviewActivity(
  user: User,
  tenantId: string,
  sessionId: string | undefined,
): Promise<BlockItems<ActivityFeedItem>> {
  const [events, routes] = await Promise.all([
    loadAccountActivity(user, sessionId),
    accessibleRoutes(user, tenantId),
  ]);
  return { items: toActivityFeedItems(events, routes) };
}
