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
  badge?: string;
  /** The tone of a counted badge; neutral when absent. */
  badgeTone?: Tone;
}

/**
 * Fresh counts a page publishes for its navigation entry, by page full id
 * (`settings.workspace.members` → `{ label: "7" }`, `""` for none), with
 * their tone. The server counts a table view tab declared with `navBadge`
 * when the menu loads; the table publishes its own counter here once shown,
 * which navigation surfaces draw over the server's badge.
 *
 * Shared state, so a count published on one page stays shown on the others.
 */
export const useNavBadges = () => {
  const badges = useDmsState<Record<string, NavBadge>>(
    "dms-nav-badges",
    () => ({}),
  );

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

  return { badges, setNavBadge, navBadgeOf };
};
