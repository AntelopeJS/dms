import type { Tone } from "../../../types/tone";

/** A page's navigation badge: its label (`""` for none) and its tone. */
export interface NavBadge {
  label: string;
  /** Neutral (grey) when absent. */
  tone?: Tone;
}

/** A menu entry as the server serves it, as far as its badge goes. */
export interface ServedNavBadge {
  fullId?: string;
  /** A static badge the page declares. */
  badge?: string;
  badgeTone?: Tone;
}

/** A badge a page visit carries (`navBadges`), counted for this visit. */
export interface CountedNavBadge {
  badge: string;
  /** Neutral when absent. */
  tone?: Tone;
}

/**
 * The counts of the navigation entries, by page full id
 * (`settings.workspace.members` → `{ label: "7" }`, `""` for none), with
 * their tone. Each page visit brings the ones the server counted for it
 * (`navBadges`, a page prop: the site layout a browser keeps for minutes
 * holds none), and a table view tab declared with `navBadge` publishes its
 * own counter once shown; navigation surfaces draw them over a static badge.
 *
 * Shared state, so a count published on one page stays shown on the others.
 */
export const useNavBadges = () => {
  const badges = useDmsState<Record<string, NavBadge>>(
    "dms-nav-badges",
    () => ({}),
  );
  const servedIds = useDmsState<string[]>("dms-served-nav-badges", () => []);

  /** Sets, or with `undefined` clears, the badge of a page. */
  function setNavBadge(
    fullId: string,
    label: string | undefined,
    tone?: Tone,
  ): void {
    const current = badges.value[fullId];
    if (current?.label === label && current?.tone === tone) return;
    const { [fullId]: _previous, ...rest } = badges.value;
    if (label === undefined) {
      if (current !== undefined) badges.value = rest;
      return;
    }
    badges.value = { ...rest, [fullId]: tone ? { label, tone } : { label } };
  }

  /**
   * The badge `entry` shows: the one its page published, fresher, or the
   * one the server served; undefined when it has none.
   */
  function navBadgeOf(entry: ServedNavBadge): NavBadge | undefined {
    const live =
      entry.fullId === undefined ? undefined : badges.value[entry.fullId];
    const served: NavBadge | undefined =
      entry.badge === undefined
        ? undefined
        : { label: entry.badge, tone: entry.badgeTone };
    const badge = live ?? served;
    return badge?.label ? badge : undefined;
  }

  /**
   * Takes the counts a page visit carries: each one replaces the entry's
   * badge, and an entry the previous visit counted that this one does not
   * (its count fell to zero) loses its badge.
   */
  function applyCountedNavBadges(
    counted: Record<string, CountedNavBadge> | undefined,
  ): void {
    if (!counted) return;
    for (const fullId of servedIds.value) {
      if (!(fullId in counted)) setNavBadge(fullId, "");
    }
    for (const [fullId, { badge, tone }] of Object.entries(counted)) {
      setNavBadge(fullId, badge, tone);
    }
    servedIds.value = Object.keys(counted);
  }

  return { badges, setNavBadge, navBadgeOf, applyCountedNavBadges };
};
