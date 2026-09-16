import type { LinkProps, NavigationMenuItem } from "@nuxt/ui";

export interface TreeItem extends LinkProps {
  id: string;
  title: string;
  icon?: string;
  children?: TreeItem[];
}

export function convertSiteLayoutTreeToTreeItems(
  siteLayoutTree: SiteLayoutTree | null | undefined,
): NavigationMenuItem[][] {
  if (!siteLayoutTree) {
    return [];
  }

  return convertToTreeItems(siteLayoutTree);
}

const EXCLUDED_TOP_LEVEL_IDS = new Set(["settings", "modules"]);

function isExcludedFromRoot(item: SiteLayoutTree): boolean {
  return (
    EXCLUDED_TOP_LEVEL_IDS.has(item.id) ||
    item.isModuleRoot === true ||
    item.hasAccess === false
  );
}

// A registered entry links to its own slug, narrowed by the query parameters it
// declares so a single page (with `validation.requiredQueryParams`) can back
// several entries. `exactQuery: "partial"` keeps sibling entries of that page
// from all highlighting at once while tolerating unrelated query parameters.
export function buildMenuItemTarget(
  item: SiteLayoutTree,
): MenuItemTarget | string | undefined {
  if (!item.layoutUrl) {
    return undefined;
  }
  if (!item.query || Object.keys(item.query).length === 0) {
    return item.fullSlug;
  }
  return { path: item.fullSlug, query: item.query };
}

function buildNavigationItem(
  item: SiteLayoutTree,
  children: NavigationMenuItem[],
): DmsMenuItem {
  const to = buildMenuItemTarget(item);
  return {
    id: item.id,
    fullId: item.fullId,
    label: item.displayName,
    icon: item.icon,
    to,
    ...(typeof to === "object" ? { exactQuery: "partial" } : {}),
    variant: item.variant,
    status: item.status,
    children: children.length > 0 ? children : undefined,
  };
}

function buildLabelGroup(
  item: SiteLayoutTree,
  children: NavigationMenuItem[],
): NavigationMenuItem[] {
  return [
    {
      id: item.id,
      fullId: item.fullId,
      label: item.displayName,
      icon: item.icon,
      type: "label",
    },
    ...children,
  ];
}

function convertToTreeItems(node: SiteLayoutTree): NavigationMenuItem[][] {
  const groups: NavigationMenuItem[][] = [];

  for (const nodeId of node.childrenOrders) {
    const item = node.children[nodeId]!;
    if (isExcludedFromRoot(item)) {
      continue;
    }

    const children = convertChildrenToItems(item);

    if (item.type === "label") {
      if (children.length === 0) {
        continue;
      }
      groups.push(buildLabelGroup(item, children));
    } else {
      groups.push([buildNavigationItem(item, children)]);
    }
  }

  return groups;
}

// Module roots are only ever direct children of the `modules` category, so the
// same walk serves the root menu and a module's own menu.
function convertChildrenToItems(node: SiteLayoutTree): NavigationMenuItem[] {
  return node.childrenOrders
    .map((nodeId) => {
      const item = node.children[nodeId]!;

      if (item.isModuleRoot || item.hasAccess === false) {
        return null;
      }

      return buildNavigationItem(item, convertChildrenToItems(item));
    })
    .filter((item) => item !== null) as NavigationMenuItem[];
}

const MODULE_PAGES_GROUP_ID = "module-pages";
const MODULE_PAGES_GROUP_LABEL = "$menu.section.pages";

export function convertSiteLayoutTreeToTreeItemsForModule(
  moduleRoot: SiteLayoutTree | null | undefined,
): NavigationMenuItem[][] {
  if (!moduleRoot) {
    return [];
  }

  const subCategoryGroups: NavigationMenuItem[][] = [];
  const pageItems: NavigationMenuItem[] = [];

  for (const nodeId of moduleRoot.childrenOrders) {
    const item = moduleRoot.children[nodeId]!;

    if (item.hasAccess === false) {
      continue;
    }

    const children = convertChildrenToItems(item);

    if (item.type === "label") {
      if (children.length === 0) {
        continue;
      }

      subCategoryGroups.push(buildLabelGroup(item, children));
    } else {
      pageItems.push(buildNavigationItem(item, children));
    }
  }

  const groups: NavigationMenuItem[][] = [];
  // Fallback grouping: pages that are direct non-label children of the module
  // root are wrapped in a synthetic "Pages" group. A module's `defaultCategory`
  // redirects its loose pages (module set, no explicit category) into a real
  // category child rendered via `subCategoryGroups` above; pages that instead
  // target the module root explicitly still land here.
  if (pageItems.length > 0) {
    groups.push([
      {
        id: MODULE_PAGES_GROUP_ID,
        label: MODULE_PAGES_GROUP_LABEL,
        type: "label",
      },
      ...pageItems,
    ]);
  }
  groups.push(...subCategoryGroups);

  return groups;
}
