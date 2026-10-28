import { watch } from "vue";
import { useDmsInertiaPage } from "#dms/frontend-module";
import {
  type CountedNavBadge,
  useNavBadges,
} from "#dms-ui/app/entries/composables/navigation/useNavBadges";

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
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The renderer page contract does not declare this optional module extension. Inference cannot expose it; validating badges here would change existing pass-through behavior for malformed pages.
    () => (inertiaPage.props.page as CountedPage | undefined)?.navBadges,
    applyCountedNavBadges,
    { immediate: true },
  );
}
