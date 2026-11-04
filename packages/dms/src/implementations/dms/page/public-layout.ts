import type { SiteLayoutPayload } from "./types";

type Layout = SiteLayoutPayload["siteLayout"];
type LayoutTree = SiteLayoutPayload["siteLayoutTree"];

function withOnlyReachableChildren(node: LayoutTree): LayoutTree {
  const children: LayoutTree["children"] = {};
  for (const [key, child] of Object.entries(node.children)) {
    const pruned = withOnlyReachableChildren(child);
    if (pruned.hasAccess !== false || Object.keys(pruned.children).length > 0)
      children[key] = pruned;
  }
  return {
    ...node,
    children,
    ...(node.childrenOrders && {
      childrenOrders: node.childrenOrders.filter((key) => key in children),
    }),
  };
}

function categoriesNamedBy(
  categories: Layout["categories"],
  pages: Layout["pages"],
): Layout["categories"] {
  const kept: Layout["categories"] = {};
  const pending = Object.values(pages).flatMap((page) =>
    page.categoryId ? [page.categoryId] : [],
  );
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    const category = categories[id];
    if (!category || id in kept) continue;
    kept[id] = category;
    if (category.categoryId) pending.push(category.categoryId);
  }
  return kept;
}

/**
 * The site layout of a visitor who is not signed in: only what that visitor
 * can open, the public pages. The entries it cannot open stay out, so a
 * response does not list the slugs, ids and modules of the application; a
 * route the layout does not hold is, to the client, one that is not public,
 * like a redacted entry.
 */
export function publicSiteLayoutOnly(
  layout: SiteLayoutPayload,
): SiteLayoutPayload {
  const pages = Object.fromEntries(
    Object.entries(layout.siteLayout.pages).filter(
      ([, page]) => page.hasAccess,
    ),
  );
  return {
    ...layout,
    siteLayout: {
      ...layout.siteLayout,
      pages,
      categories: categoriesNamedBy(layout.siteLayout.categories, pages),
    },
    siteLayoutTree: withOnlyReachableChildren(layout.siteLayoutTree),
    modules: Object.fromEntries(
      Object.entries(layout.modules).filter(([, module]) => module.hasAccess),
    ),
  };
}
