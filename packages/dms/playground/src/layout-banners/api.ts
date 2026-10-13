import {
  Context,
  Controller,
  Get,
  HTTPResult,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { NotifyMenuChanged } from "@antelopejs/interface-dms/page";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import {
  BANNER_KEYS,
  type BannerKey,
  isBannerShown,
  toggleBanner,
} from "./banners";

export const LAYOUT_BANNERS_API = "/api/playground/banners";
const HTTP_NOT_FOUND = 404;

const BANNER_LABELS: Record<BannerKey, string> = {
  info: "Text banner (text + actions, dismissible)",
  "past-due": "Resolved banner (resolve, ComposedText)",
  component: "Component banner (component + props)",
};

function isBannerKey(key: string): key is BannerKey {
  return BANNER_KEYS.some((known) => known === key);
}

interface BannerToggleResult {
  key: BannerKey;
  shown: boolean;
}

interface ItemsResponse {
  items: KeyValueListItem[];
}

/**
 * Switches the playground's layout banners for the caller's workspace. A
 * banner's resolver runs while the site layout is built, so the route tells
 * the DMS the layout changed: every open session of the workspace reads it
 * again and the banner appears without a reload.
 */
export class LayoutBannersDemoController extends Controller(
  LAYOUT_BANNERS_API,
) {
  @Post(":key/toggle")
  async toggle(
    @Context() ctx: RequestContext,
    @AuthUser() _user: User,
    @Parameter("key") key: string,
  ): Promise<BannerToggleResult> {
    if (!isBannerKey(key)) {
      throw new HTTPResult(HTTP_NOT_FOUND, "Unknown banner");
    }
    const tenantId = getRequestTenantId(ctx);
    const shown = toggleBanner(key, tenantId);
    await NotifyMenuChanged(tenantId);
    return { key, shown };
  }

  @Get("status")
  status(
    @Context() ctx: RequestContext,
    @AuthUser() _user: User,
  ): ItemsResponse {
    const tenantId = getRequestTenantId(ctx);
    return {
      items: BANNER_KEYS.map((key) => {
        const shown = isBannerShown(key, tenantId);
        return {
          label: BANNER_LABELS[key],
          value: shown ? "Shown" : "Off",
          type: "status",
          tone: shown ? "success" : "neutral",
        };
      }),
    };
  }
}
