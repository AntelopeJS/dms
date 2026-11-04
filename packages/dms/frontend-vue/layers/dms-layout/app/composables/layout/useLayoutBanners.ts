export const DISMISSED_BANNERS_COOKIE = "dms-dismissed-banners";

type LayoutBannerRole = "status" | "alert";

interface LayoutBannerPresentation {
  role: LayoutBannerRole;
  color: LayoutBannerVariant;
  icon: string;
}

const PRESENTATIONS: Record<LayoutBannerVariant, LayoutBannerPresentation> = {
  info: { role: "status", color: "info", icon: "i-ph-info-light" },
  warning: { role: "status", color: "warning", icon: "i-ph-warning-light" },
  error: { role: "alert", color: "error", icon: "i-ph-warning-octagon-light" },
};

/**
 * Role, color and icon a banner renders with. An unknown variant — from a
 * newer backend, or an untyped registration — renders as `info` rather than
 * as an unstyled strip.
 */
export const resolveLayoutBannerPresentation = (
  banner: LayoutBanner,
): LayoutBannerPresentation => {
  const presentation = PRESENTATIONS[banner.variant] ?? PRESENTATIONS.info;
  return { ...presentation, icon: banner.icon ?? presentation.icon };
};

/**
 * Whether a path is in the module area: the modules page, the module store
 * and every module's own pages, all under `MODULE_URL_PREFIX`.
 */
export const isModuleAreaPath = (path: string): boolean =>
  path === MODULE_URL_PREFIX || path.startsWith(`${MODULE_URL_PREFIX}/`);

const SCOPE_MATCHERS: Record<
  LayoutBannerScope,
  (isModuleArea: boolean) => boolean
> = {
  app: (isModuleArea) => !isModuleArea,
  modules: (isModuleArea) => isModuleArea,
  everywhere: () => true,
};

/** Whether a banner's scope, as the backend serves it, covers a page. */
export const isLayoutBannerInScope = (
  banner: LayoutBanner,
  path: string,
): boolean => SCOPE_MATCHERS[banner.scope](isModuleAreaPath(path));

/**
 * The global banners rendered under the dashboard header, as resolved by the
 * server for this request (see `RegisterLayoutBanner` in
 * `@antelopejs/interface-dms/layout-banners`), keeping the ones whose scope
 * covers the current route, minus the ones the user dismissed.
 *
 * The site layout is shared by every page, so the scope is applied here
 * against the route: on the server-rendered page and again on each
 * client-side navigation, without re-fetching the layout.
 *
 * Dismissals are kept in a session cookie rather than in local storage so the
 * server-rendered page already leaves a dismissed banner out, instead of
 * painting it and removing it on hydration.
 */
export const useLayoutBanners = () => {
  const { siteLayout } = useSiteLayout();
  const route = useDmsRoute();
  const dismissed = useDmsCookie<string[]>(DISMISSED_BANNERS_COOKIE, {
    default: () => [],
    sameSite: "lax",
  });

  const banners = computed<LayoutBanner[]>(() =>
    (siteLayout.value?.banners ?? []).filter(
      (banner) =>
        isLayoutBannerInScope(banner, route.path) &&
        (!banner.dismissible || !dismissed.value.includes(banner.key)),
    ),
  );

  function dismiss(key: string): void {
    if (dismissed.value.includes(key)) return;
    dismissed.value = [...dismissed.value, key];
  }

  return { banners, dismiss };
};
