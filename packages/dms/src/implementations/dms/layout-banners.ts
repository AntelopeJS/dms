import type {
  LayoutBannerContext,
  LayoutBannerInfo,
  LayoutBannerVariant,
} from "@antelopejs/interface-dms/layout-banners";
import { withResolverTimeout } from "./resolver-timeout";
import { warnOnceFor } from "./warn-once";

const DEFAULT_BANNER_ORDER = 0;

const bannersByKey = new Map<string, LayoutBannerInfo>();

export namespace internal {
  // Keyed by `key` rather than by object: across the interface boundary the
  // runtime receives a view of the registration, and reference equality does
  // not survive the round trip.
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
 * visibility resolver already applied — the resolver itself never leaves the
 * server.
 */
export interface LayoutBannerSerialized {
  key: string;
  variant: LayoutBannerVariant;
  order: number;
  dismissible: boolean;
  icon?: string;
  text?: string;
  component?: string;
  props?: Record<string, unknown>;
}

function serializeLayoutBanner(
  banner: LayoutBannerInfo,
): LayoutBannerSerialized {
  return {
    key: banner.key,
    variant: banner.variant,
    order: banner.order ?? DEFAULT_BANNER_ORDER,
    dismissible: banner.dismissible === true,
    icon: banner.icon,
    text: banner.text,
    component: banner.component,
    props: banner.props,
  };
}

// The types forbid a banner with no content, but an untyped registration can
// still carry one: it would render as an empty colored strip.
function hasContent(banner: LayoutBannerInfo): boolean {
  if (banner.text || banner.component) return true;
  warnOnceFor(
    banner,
    "no-content",
    `[dms] layout banner "${banner.key}" has neither a text nor a component and was skipped.`,
  );
  return false;
}

async function isBannerVisible(
  banner: LayoutBannerInfo,
  context: LayoutBannerContext,
): Promise<boolean> {
  if (!hasContent(banner)) return false;
  if (!banner.visible) return true;
  try {
    const visible = await withResolverTimeout(
      Promise.resolve(banner.visible(context)),
      `layout banner "${banner.key}"`,
    );
    return visible === true;
  } catch (error) {
    // Throwing and hanging land here alike: the banner stays hidden for this
    // request rather than taking the whole site layout down with it.
    warnOnceFor(
      banner,
      "visibility-failed",
      `[dms] layout banner "${banner.key}" visibility resolver failed: ${String(error)}`,
    );
    return false;
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
  // Snapshot first: a module registering while the resolvers are pending would
  // shift the registry under the index-based filter below.
  const banners = [...bannersByKey.values()];
  const verdicts = await Promise.all(
    banners.map((banner) => isBannerVisible(banner, context)),
  );
  return banners
    .filter((_, index) => verdicts[index])
    .map(serializeLayoutBanner)
    .sort((a, b) => a.order - b.order);
}
