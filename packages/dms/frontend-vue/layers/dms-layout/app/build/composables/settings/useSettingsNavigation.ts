import type { MenuItemStatus } from "#dms-core/app/types/menu";
import type { SiteLayoutTree } from "../../../types/page";
import {
  listCategoryPages,
  listPagesAmong,
  orderedChildren,
} from "../../utils/categoryPages";

export const SETTINGS_ROOT_ID = "settings";
const DEFAULT_SETTINGS_ICON = "i-ph-gear-six";

export interface SettingsNavPage {
  fullId: string;
  label: string;
  description: string;
  icon: string;
  to: string;
  /** Badge the server counted or the page declared for its entry. */
  badge?: string;
  /** The tone of a counted badge; neutral when absent. */
  badgeTone?: MenuItemBadgeTone;
  /** Dot the page declared for its entry. */
  status?: MenuItemStatus;
}

export interface SettingsNavGroup {
  id: string;
  /** The category's display name, an i18n key (`$…`) or a literal. */
  label: string;
  description?: string;
  pages: SettingsNavPage[];
}

const toNavPage = (node: SiteLayoutTree): SettingsNavPage => ({
  fullId: node.fullId,
  label: node.displayName,
  description: node.description || "",
  icon: node.icon || DEFAULT_SETTINGS_ICON,
  to: node.fullSlug,
  badge: node.badge,
  badgeTone: node.badgeTone,
  status: node.status,
});

function groupOf(
  category: SiteLayoutTree,
  pages: SiteLayoutTree[],
): SettingsNavGroup {
  return {
    id: category.fullId,
    label: category.displayName,
    description: category.description,
    pages: pages.map(toNavPage),
  };
}

/**
 * The settings navigation's groups: one per category declared under the
 * settings root, in menu order, then the pages declared on the root itself.
 * Each lists the pages the viewer can open, in menu order.
 */
export function buildSettingsGroups(root: SiteLayoutTree): SettingsNavGroup[] {
  const children = orderedChildren(root);
  const groups = children
    .filter((child) => !child.layoutUrl)
    .map((category) => groupOf(category, listCategoryPages(category)));
  const rootPages = children.filter((child) => child.layoutUrl);
  groups.push(groupOf(root, listPagesAmong(rootPages, root.fullSlug)));
  return groups.filter((group) => group.pages.length > 0);
}

/**
 * The settings pages the current user can open, grouped the way the settings
 * navigation shows them.
 */
export const useSettingsNavigation = () => {
  const siteLayout = useSiteLayout();

  const groups = computed<SettingsNavGroup[]>(() => {
    const root = siteLayout.siteLayoutTree.value?.children[SETTINGS_ROOT_ID];
    return root ? buildSettingsGroups(root) : [];
  });

  return { groups };
};

/**
 * The nav path the current route stands under: the longest one it equals or
 * lies below, so a page nested under another (pending invitations under
 * Members) is the only one marked active there.
 */
export function findActiveSettingsPath(
  path: string,
  paths: readonly string[],
): string | undefined {
  let active: string | undefined;
  for (const candidate of paths) {
    const matches = path === candidate || path.startsWith(`${candidate}/`);
    if (matches && candidate.length > (active?.length ?? -1)) {
      active = candidate;
    }
  }
  return active;
}
