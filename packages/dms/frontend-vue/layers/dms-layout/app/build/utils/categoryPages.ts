import type { SiteLayoutTree } from "../../types/page";

/** A node's children, in the order the menu lists them (`order`, then name). */
export function orderedChildren(node: SiteLayoutTree): SiteLayoutTree[] {
  return (node.childrenOrders ?? Object.keys(node.children))
    .map((id) => node.children[id])
    .filter((child): child is SiteLayoutTree => !!child);
}

/** The node registered under `fullId`, found by walking its dotted id. */
export function findTreeNode(
  root: SiteLayoutTree | undefined,
  fullId: string,
): SiteLayoutTree | undefined {
  let node = root;
  for (const segment of fullId.split(".")) {
    node = node?.children[segment];
  }
  return node;
}

const isOpenablePage = (node: SiteLayoutTree): boolean =>
  !!node.layoutUrl && node.hasAccess !== false;

/**
 * The pages the viewer can open among `nodes` and under them, in menu order,
 * each one followed by the pages nested under it. The page answering at `landingSlug` leads to the others rather
 * than being one of them.
 */
export function listPagesAmong(
  nodes: SiteLayoutTree[],
  landingSlug: string,
): SiteLayoutTree[] {
  return nodes.flatMap((node) => [
    ...(isOpenablePage(node) && node.fullSlug !== landingSlug ? [node] : []),
    ...listPagesAmong(orderedChildren(node), landingSlug),
  ]);
}

/** The pages the viewer can open under `category`, in menu order. */
export function listCategoryPages(category: SiteLayoutTree): SiteLayoutTree[] {
  return listPagesAmong(orderedChildren(category), category.fullSlug);
}
