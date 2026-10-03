/** Severity of the dot a settings nav item can carry. */
export type SettingsNavTrailStatus = "warning" | "error";

/**
 * What the settings navigation shows at the end of an item. The nav renders a
 * single trail per item, in this order of precedence: `badge`, then `status`,
 * then `tag`.
 *
 * Every field is serializable, so a trail can be set from an SSR-safe plugin
 * as well as from a page or a component.
 */
export interface SettingsNavTrail {
  /** Settings page the trail belongs to (`settings.user.notifications`…). */
  fullId: string;
  /** Short count or ratio (`3`, `8/10`). */
  badge?: string;
  /** A dot drawing attention to the page. */
  status?: SettingsNavTrailStatus;
  /** Module tag for a page a module contributes (`SAAS`). */
  tag?: string;
  /** Accessible label of the dot or badge (`Payment failed`). */
  label?: string;
}

/**
 * Settings pages whose indicator the dashboard loads by itself after mount,
 * and whether it is a trail (with a label the overview card shows: pending
 * invitations, the security dot, the unread count) or a bare nav count
 * (members, roles). Until it has loaded, their entries and cards hold a
 * placeholder in its place. Static, so the server and the hydrating browser
 * agree.
 */
const LOADED_INDICATORS: Record<string, "trail" | "count"> = {
  "settings.user.members": "count",
  "settings.user.members.invites": "trail",
  "settings.user.roles": "count",
  "settings.user.security": "trail",
  "settings.user.notifications": "trail",
};

interface UseSettingsNavTrailsReturn {
  trails: Readonly<Ref<Record<string, SettingsNavTrail>>>;
  setTrail: (trail: SettingsNavTrail) => void;
  clearTrail: (fullId: string) => void;
  /** Says a page's indicator has loaded (or failed): its placeholder goes. */
  settleIndicator: (fullId: string) => void;
  /** Whether a page's indicator is still loading. */
  isIndicatorPending: (fullId: string) => boolean;
  /** Whether a page's labelled trail (an overview card's state) is loading. */
  isTrailPending: (fullId: string) => boolean;
}

/**
 * Registry of the live indicators shown in the settings navigation — unread
 * counts, seat ratios, attention dots, module tags. Setting a trail replaces
 * the one the page had.
 */
export const useSettingsNavTrails = (): UseSettingsNavTrailsReturn => {
  const trails = useDmsState<Record<string, SettingsNavTrail>>(
    "dms-settings-nav-trails",
    () => ({}),
  );

  function setTrail(trail: SettingsNavTrail): void {
    trails.value = { ...trails.value, [trail.fullId]: trail };
  }

  function clearTrail(fullId: string): void {
    const { [fullId]: _removed, ...rest } = trails.value;
    trails.value = rest;
  }

  const settled = useDmsState<Record<string, boolean>>(
    "dms-settings-nav-indicators-settled",
    () => ({}),
  );

  function settleIndicator(fullId: string): void {
    if (settled.value[fullId]) return;
    settled.value = { ...settled.value, [fullId]: true };
  }

  const isIndicatorPending = (fullId: string): boolean =>
    fullId in LOADED_INDICATORS && !settled.value[fullId];
  const isTrailPending = (fullId: string): boolean =>
    LOADED_INDICATORS[fullId] === "trail" && !settled.value[fullId];

  return {
    trails,
    setTrail,
    clearTrail,
    settleIndicator,
    isIndicatorPending,
    isTrailPending,
  };
};
