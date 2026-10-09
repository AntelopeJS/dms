import { usePermissionPreview } from "#dms-core/app/build/composables/auth/usePermissionPreview";
import { useNavBadges } from "#dms-ui/app/build/composables/navigation/useNavBadges";
import type { Tone } from "#dms-ui/app/types/tone";
import { findTreeNode, listCategoryPages } from "../../utils/categoryPages";

const DEFAULT_PAGE_ICON = "i-ph-file";

/** A card standing for one page of a category. */
export interface CategoryNavCard {
  /** The page's full id. */
  id: string;
  title: string;
  description?: string;
  icon: string;
  to: string;
  /** The page's navigation badge, as the menu shows it. */
  state?: string;
  /** The badge's tone, as the menu draws it. */
  stateTone?: Tone;
}

/**
 * A card per page the viewer can open under a category, in menu order, each
 * with the badge the navigation shows for it.
 *
 * @param categoryId Full id of the category, read reactively
 */
export function useCategoryNavCards(categoryId: () => string | undefined) {
  const siteLayout = useSiteLayout();
  const { navBadgeOf } = useNavBadges();
  const cards = computed<CategoryNavCard[]>(() => {
    const id = categoryId();
    const category = id
      ? findTreeNode(siteLayout.siteLayoutTree.value, id)
      : undefined;
    if (!category) return [];
    return listCategoryPages(category).map((page) => {
      const badge = navBadgeOf(page);
      return {
        id: page.fullId,
        title: page.displayName,
        description: page.description,
        icon: page.icon || DEFAULT_PAGE_ICON,
        to: page.fullSlug,
        state: badge?.label,
        stateTone: badge?.tone,
      };
    });
  });
  return { cards };
}

/**
 * "Preview as role" on entries leading to pages: the veil over an entry the
 * role could not open, or opens without all of it. Never outside a preview.
 */
export function usePreviewEntryVeil() {
  const preview = usePermissionPreview();
  const { t } = useI18n();
  const params = () => ({ role: preview.session.value?.roleName ?? "" });
  const label = (fullId: string): string => {
    const state = preview.entryState(fullId);
    if (state === "hidden") {
      return t("page.settings.roles.preview.veil_hidden", params());
    }
    return state === "partial"
      ? t("page.settings.roles.preview.veil_partial")
      : "";
  };
  const detail = (fullId: string): string | undefined =>
    preview.entryState(fullId) === "partial"
      ? t("page.settings.roles.preview.menu_partial", params())
      : undefined;
  return {
    state: (fullId: string) => preview.entryState(fullId),
    label,
    detail,
    isActive: preview.isActive,
  };
}
