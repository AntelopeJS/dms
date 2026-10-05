/**
 * Fresh counts a page publishes for its navigation entry, by page full id
 * (`settings.user.members` → `"7"`, `""` for none). The server counts a table
 * view tab declared with `navBadge: true` when the menu loads; the table
 * publishes its own counter here once shown, which navigation surfaces draw
 * over the server's badge.
 *
 * Shared state, so a count published on one page stays shown on the others.
 */
export const useNavBadges = () => {
  const badges = useDmsState<Record<string, string>>(
    "dms-nav-badges",
    () => ({}),
  );

  /** Sets, or with `undefined` clears, the badge of a page. */
  function setNavBadge(fullId: string, badge: string | undefined): void {
    if (badges.value[fullId] === badge) return;
    const { [fullId]: _previous, ...rest } = badges.value;
    badges.value = badge === undefined ? rest : { ...rest, [fullId]: badge };
  }

  return { badges, setNavBadge };
};
