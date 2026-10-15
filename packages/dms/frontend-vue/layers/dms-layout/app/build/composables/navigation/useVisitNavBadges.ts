import { watch } from "vue";
import { useDmsInertiaPage } from "#dms/frontend-module";
import {
  type CountedNavBadge,
  useNavBadges,
} from "#dms-ui/app/build/composables/navigation/useNavBadges";

interface CountedPage {
  navBadges?: Record<string, CountedNavBadge>;
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
    () => (inertiaPage.props.page as CountedPage | undefined)?.navBadges,
    applyCountedNavBadges,
    { immediate: true },
  );
}
