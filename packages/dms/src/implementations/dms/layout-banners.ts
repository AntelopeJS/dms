import {
  type LayoutBannerContext,
  type LayoutBannerInfo,
  LayoutBannerScope,
  type LayoutBannerVariant,
} from "@antelopejs/interface-dms/layout-banners";
import type { BlockLinkAction } from "@antelopejs/interface-dms/base/display";
import type { BlockText } from "@antelopejs/interface-dms/base/types/composed-text";
import { withResolverTimeout } from "./resolver-timeout";
import { warnOnceFor } from "./warn-once";

const DEFAULT_BANNER_ORDER = 0;

const bannersByKey = new Map<string, LayoutBannerInfo>();

export namespace internal {
  export const RegisterLayoutBanner = {
    register: (info: LayoutBannerInfo) => {
      bannersByKey.set(info.key, info);
    },
    unregister: (info: LayoutBannerInfo) => {
      bannersByKey.delete(info.key);
    },
  };
}

/**
 * A banner as the browser receives it: its content and chrome, with the
 * resolvers already applied — they never leave the server. The scope travels
 * with it because the site layout is shared by every page: the dashboard
 * applies it against the current route, server-side and on each navigation.
 */
export interface LayoutBannerSerialized {
  key: string;
  variant: LayoutBannerVariant;
  order: number;
  scope: LayoutBannerScope;
  dismissible: boolean;
  icon?: string;
  text?: BlockText;
  actions?: BlockLinkAction[];
  component?: string;
  props?: Record<string, unknown>;
}

type LayoutBannerBody = Pick<
  LayoutBannerSerialized,
  "text" | "actions" | "component" | "props"
>;

function staticBody(banner: LayoutBannerInfo): LayoutBannerBody {
  return {
    text: banner.text,
    actions: banner.actions,
    component: banner.component,
    props: banner.props,
  };
}

const LAYOUT_BANNER_SCOPES: ReadonlySet<string> = new Set(
  Object.values(LayoutBannerScope),
);

function resolveScope(banner: LayoutBannerInfo): LayoutBannerScope {
  const { scope } = banner;
  return scope && LAYOUT_BANNER_SCOPES.has(scope)
    ? scope
    : LayoutBannerScope.APP;
}

function serializeLayoutBanner(
  banner: LayoutBannerInfo,
  body: LayoutBannerBody,
): LayoutBannerSerialized {
  return {
    key: banner.key,
    variant: banner.variant,
    order: banner.order ?? DEFAULT_BANNER_ORDER,
    scope: resolveScope(banner),
    dismissible: banner.dismissible === true,
    icon: banner.icon,
    ...body,
  };
}

function hasContent(banner: LayoutBannerInfo): boolean {
  if (banner.text || banner.component || banner.resolve) return true;
  warnOnceFor(
    banner,
    "no-content",
    `[dms] layout banner "${banner.key}" has neither a text, a component nor a resolver and was skipped.`,
  );
  return false;
}

/** What the banner shows for this request, `undefined` when it is hidden. */
async function readBody(
  banner: LayoutBannerInfo,
  context: LayoutBannerContext,
): Promise<LayoutBannerBody | undefined> {
  if (banner.resolve) {
    const content = await banner.resolve(context);

    if (!content?.text) return undefined;
    return { text: content.text, actions: content.actions };
  }
  if (!banner.visible) return staticBody(banner);
  const visible = await banner.visible(context);
  return visible === true ? staticBody(banner) : undefined;
}

async function resolveBanner(
  banner: LayoutBannerInfo,
  context: LayoutBannerContext,
): Promise<LayoutBannerSerialized | undefined> {
  if (!hasContent(banner)) return undefined;
  try {
    const body = await withResolverTimeout(
      readBody(banner, context),
      `layout banner "${banner.key}"`,
    );
    return body && serializeLayoutBanner(banner, body);
  } catch (error) {
    warnOnceFor(
      banner,
      "resolver-failed",
      `[dms] layout banner "${banner.key}" resolver failed: ${String(error)}`,
    );
    return undefined;
  }
}

/**
 * The banners to render for one request, sorted by `order` — ties keep the
 * registration order. The resolvers run together, so the request waits for
 * the slowest rather than for their sum, and never rejects: a failing resolver
 * only hides its own banner.
 */
export async function resolveLayoutBanners(
  context: LayoutBannerContext,
): Promise<LayoutBannerSerialized[]> {
  const banners = [...bannersByKey.values()];
  const resolved = await Promise.all(
    banners.map((banner) => resolveBanner(banner, context)),
  );
  return resolved
    .filter((banner): banner is LayoutBannerSerialized => banner !== undefined)
    .sort((a, b) => a.order - b.order);
}
