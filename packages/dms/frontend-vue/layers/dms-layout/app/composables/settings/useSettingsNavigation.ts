import type { PageInfo, SiteLayoutTree } from "../../types/page";

export const SETTINGS_ROOT_ID = "settings";
const SETTINGS_ID_PREFIX = `${SETTINGS_ROOT_ID}.`;
const SETTINGS_INDEX_ID = `${SETTINGS_ROOT_ID}.${SETTINGS_ROOT_ID}`;
const USER_CATEGORY_PREFIX = `${SETTINGS_ID_PREFIX}user.`;
const WORKSPACE_CATEGORY_PREFIX = `${SETTINGS_ID_PREFIX}workspace.`;
const DEFAULT_SETTINGS_ICON = "i-ph-gear-six";

export const SettingsNavGroupId = {
  ACCOUNT: "account",
  WORKSPACE: "workspace",
} as const;

/**
 * Personal pages, in nav order. Everything else under the user category is
 * personal too and follows them.
 */
const ACCOUNT_PAGE_ORDER = [
  "settings.user.profile",
  "settings.user.region",
  "settings.user.security",
  "settings.user.notifications",
  "settings.user.appearance",
  "settings.user.shortcuts",
];

/**
 * Pages registered under the user category that administer the workspace.
 * Their ids stay where they are (they are permission ids); only the nav moves
 * them next to the workspace category.
 */
const WORKSPACE_PAGE_ORDER = ["settings.user.members", "settings.user.roles"];

/** Pending invitations: a page nested under Members, hidden from the menu. */
export const INVITES_PAGE_ID = "settings.user.members.invites";

/**
 * Settings pages registered `hidden` (out of the menu tree) that the nav still
 * lists, each right after the page it belongs with and under the label given
 * here. They come from the site layout's page registry, which carries every
 * page with the viewer's access to it, so one the viewer cannot open stays out.
 */
const LINKED_SETTINGS_PAGES: Record<string, { after: string; label: string }> =
  {
    [INVITES_PAGE_ID]: {
      after: "settings.user.members",
      label: "$page.settings.shell.member_invitations",
    },
  };

/** How far after the page it belongs with a linked page ranks. */
const LINKED_PAGE_OFFSET = 0.5;

/** The page a linked page is ranked and grouped with; itself otherwise. */
const anchorOf = (fullId: string): string =>
  LINKED_SETTINGS_PAGES[fullId]?.after ?? fullId;

export interface SettingsNavPage {
  fullId: string;
  label: string;
  description: string;
  icon: string;
  to: string;
  /** Badge the server counted or declared for the page's entry. */
  badge?: string;
}

export interface SettingsNavGroup {
  id: string;
  /** i18n key (`$…`) or a category display name. */
  label: string;
  pages: SettingsNavPage[];
}

/** What the nav reads of a page: a menu tree node or a registry entry. */
type SettingsPageNode = Omit<PageInfo, "layoutUrl">;

interface CollectedPage {
  node: SettingsPageNode;
  parent: SiteLayoutTree;
}

const isSettingsPage = (node: SiteLayoutTree): boolean =>
  !!node.layoutUrl &&
  node.fullId.startsWith(SETTINGS_ID_PREFIX) &&
  node.fullId !== SETTINGS_INDEX_ID &&
  node.hasAccess !== false;

function collectSettingsPages(
  node: SiteLayoutTree,
  parent: SiteLayoutTree | null,
  into: CollectedPage[],
): void {
  if (parent && isSettingsPage(node)) into.push({ node, parent });
  for (const childId of node.childrenOrders ?? Object.keys(node.children)) {
    const child = node.children[childId];
    if (child) collectSettingsPages(child, node, into);
  }
}

const toNavPage = (node: SettingsPageNode): SettingsNavPage => ({
  fullId: node.fullId,
  label: LINKED_SETTINGS_PAGES[node.fullId]?.label ?? node.displayName,
  description: node.description || "",
  icon: node.icon || DEFAULT_SETTINGS_ICON,
  to: node.fullSlug,
  badge: node.badge,
});

/** Nav group a settings page belongs to; category id for non-core pages. */
function groupIdOf({ node, parent }: CollectedPage): string {
  const fullId = anchorOf(node.fullId);
  if (WORKSPACE_PAGE_ORDER.includes(fullId)) {
    return SettingsNavGroupId.WORKSPACE;
  }
  if (fullId.startsWith(USER_CATEGORY_PREFIX)) {
    return SettingsNavGroupId.ACCOUNT;
  }
  if (fullId.startsWith(WORKSPACE_CATEGORY_PREFIX)) {
    return SettingsNavGroupId.WORKSPACE;
  }
  return parent.fullId;
}

/**
 * Position of a settings page in the nav's curated order, `-1` for a page
 * the nav lists after them by its `order`. The roles editor orders its
 * settings permissions with it.
 */
export function curatedSettingsPageRank(fullId: string): number {
  return [...ACCOUNT_PAGE_ORDER, ...WORKSPACE_PAGE_ORDER].indexOf(fullId);
}

/**
 * Rank of a page inside its group: the curated order first, then `order`. A
 * linked page comes right after the page it belongs with.
 */
function rankOf(node: SettingsPageNode): number {
  const anchor = anchorOf(node.fullId);
  const linkedOffset = anchor === node.fullId ? 0 : LINKED_PAGE_OFFSET;
  const curated = curatedSettingsPageRank(anchor);
  return (
    linkedOffset +
    (curated === -1
      ? ACCOUNT_PAGE_ORDER.length +
        WORKSPACE_PAGE_ORDER.length +
        (node.order ?? 0)
      : curated)
  );
}

/** The linked pages of the registry the viewer can open. */
function collectLinkedPages(
  pages: Record<string, PageInfo> | undefined,
  settingsRoot: SiteLayoutTree,
  into: CollectedPage[],
): void {
  for (const page of Object.values(pages ?? {})) {
    if (LINKED_SETTINGS_PAGES[page.fullId] && page.hasAccess !== false) {
      into.push({ node: page, parent: settingsRoot });
    }
  }
}

const GROUP_LABELS: Record<string, string> = {
  [SettingsNavGroupId.ACCOUNT]: "$page.settings.shell.account",
  [SettingsNavGroupId.WORKSPACE]: "$page.settings.shell.workspace",
};

const GROUP_ORDER: string[] = [
  SettingsNavGroupId.ACCOUNT,
  SettingsNavGroupId.WORKSPACE,
];

function buildGroups(pages: CollectedPage[]): SettingsNavGroup[] {
  const groups = new Map<string, SettingsNavGroup & { order: number }>();
  for (const page of pages) {
    const id = groupIdOf(page);
    if (!groups.has(id)) {
      const known = GROUP_ORDER.indexOf(id);
      groups.set(id, {
        id,
        label: GROUP_LABELS[id] ?? page.parent.displayName,
        pages: [],
        order:
          known === -1 ? GROUP_ORDER.length + (page.parent.order ?? 0) : known,
      });
    }
    groups.get(id)!.pages.push(toNavPage(page.node));
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...group }) => group);
}

/**
 * The settings pages the current user can open, grouped the way the settings
 * navigation shows them: the account pages, then the workspace pages, then one
 * group per other settings category a project or module registers.
 */
export const useSettingsNavigation = () => {
  const siteLayout = useSiteLayout();

  const groups = computed<SettingsNavGroup[]>(() => {
    const root = siteLayout.siteLayoutTree.value?.children[SETTINGS_ROOT_ID];
    if (!root) return [];
    const collected: CollectedPage[] = [];
    collectSettingsPages(root, null, collected);
    collectLinkedPages(siteLayout.siteLayout?.value?.pages, root, collected);
    collected.sort((a, b) => rankOf(a.node) - rankOf(b.node));
    return buildGroups(collected);
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

/** Whether a page or category id belongs to the settings area. */
export const isSettingsFullId = (fullId: string | null | undefined): boolean =>
  fullId === SETTINGS_ROOT_ID || !!fullId?.startsWith(SETTINGS_ID_PREFIX);
