export const SIDEBAR_START_COLLAPSED_COOKIE = "dms-sidebar-start-collapsed";
const SIDEBAR_START_COLLAPSED_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Whether the dashboard opens with the sidebar collapsed on this device, as a
 * cookie ref shared by every caller. The server reads the same cookie, so the
 * first render already has the right sidebar width.
 */
export const useSidebarStartCollapsed = () => {
  return useDmsCookie<boolean>(SIDEBAR_START_COLLAPSED_COOKIE, {
    default: () => false,
    maxAge: SIDEBAR_START_COLLAPSED_COOKIE_MAX_AGE,
  });
};
