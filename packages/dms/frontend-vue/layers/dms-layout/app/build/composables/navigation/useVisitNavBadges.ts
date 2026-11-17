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
    () => {
      const page: unknown = inertiaPage.props.page;
      return page !== null && isObject(page) ? page.navBadges : undefined;
    },
    (navBadges) =>
      applyCountedNavBadges(
        navBadges === null || !isObject(navBadges)
          ? undefined
          : Object.fromEntries(
              Object.entries(navBadges).filter(
                (entry): entry is [string, CountedNavBadge] =>
                  isCountedNavBadge(entry[1]),
              ),
            ),
      ),
    { immediate: true },
  );
}
