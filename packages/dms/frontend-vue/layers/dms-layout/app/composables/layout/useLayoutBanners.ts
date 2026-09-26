const DISMISSED_BANNERS_COOKIE = "dms-dismissed-banners";

type LayoutBannerRole = "status" | "alert";

interface LayoutBannerPresentation {
  role: LayoutBannerRole;
  color: LayoutBannerVariant;
  icon: string;
}

// An error interrupts the screen reader; info and warning wait their turn.
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
 * The global banners rendered under the dashboard header, as resolved by the
 * server for this request (see `RegisterLayoutBanner` in
 * `@antelopejs/interface-dms/layout-banners`), minus the ones the user
 * dismissed.
 *
 * Dismissals are kept in a session cookie rather than in local storage so the
 * server-rendered page already leaves a dismissed banner out, instead of
 * painting it and removing it on hydration.
 */
export const useLayoutBanners = () => {
  const { siteLayout } = useSiteLayout();
  const dismissed = useDmsCookie<string[]>(DISMISSED_BANNERS_COOKIE, {
    default: () => [],
    sameSite: "lax",
  });

  const banners = computed<LayoutBanner[]>(() =>
    (siteLayout.value?.banners ?? []).filter(
      (banner) => !banner.dismissible || !dismissed.value.includes(banner.key),
    ),
  );

  function dismiss(key: string): void {
    if (dismissed.value.includes(key)) return;
    dismissed.value = [...dismissed.value, key];
  }

  return { banners, dismiss };
};
