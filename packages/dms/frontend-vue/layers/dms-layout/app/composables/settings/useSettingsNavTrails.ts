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

interface UseSettingsNavTrailsReturn {
  trails: Readonly<Ref<Record<string, SettingsNavTrail>>>;
  setTrail: (trail: SettingsNavTrail) => void;
  clearTrail: (fullId: string) => void;
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

  return { trails, setTrail, clearTrail };
};
