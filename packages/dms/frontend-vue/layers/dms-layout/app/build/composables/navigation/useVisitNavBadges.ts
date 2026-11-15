import { watch } from "vue";
import { useDmsInertiaPage } from "#dms/frontend-module";
import { isObject, isString } from "#dms-core/app/utils/type-check";
import {
  type CountedNavBadge,
  useNavBadges,
} from "#dms-ui/app/entries/composables/navigation/useNavBadges";
import { isDmsTone } from "#dms-ui/app/entries/utils/tone";

function isCountedNavBadge(value: unknown): value is CountedNavBadge {
  if (value === null || !isObject(value) || !isString(value.badge)) {
    return false;
  }
  const { tone } = value;
  return tone === undefined || (isString(tone) && isDmsTone(tone));
}

/** The badges a page visit carries (`navBadges`), each one a counted badge. */
function countedNavBadgesOf(
  page: unknown,
): Record<string, CountedNavBadge> | undefined {
  if (page === null || !isObject(page)) return undefined;
  const { navBadges } = page;
  if (navBadges === null || !isObject(navBadges)) return undefined;
  return Object.fromEntries(
    Object.entries(navBadges).filter(
      (entry): entry is [string, CountedNavBadge] =>
        isCountedNavBadge(entry[1]),
    ),
  );
}

/**
 * Draws the navigation badges each page visit carries (`navBadges`): they
 * are counted for the visit and travel with the page, not with the site
 * layout a browser keeps for minutes. The dashboard frame calls it, so the
 * server render draws them as the browser does.
 */
export function useVisitNavBadges(): void {
  const inertiaPage = useDmsInertiaPage();
  const { applyCountedNavBadges } = useNavBadges();
  watch(
    () => countedNavBadgesOf(inertiaPage.props.page),
    applyCountedNavBadges,
    { immediate: true },
  );
}
