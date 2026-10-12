import type { SiteLayoutTree } from "../types/page";

const MODULES_TREE_KEY = "modules";

function findModuleRootNode(
  tree: SiteLayoutTree | undefined,
  moduleId: string,
): SiteLayoutTree | null {
  if (!tree) return null;
  const modulesNode = tree.children[MODULES_TREE_KEY];
  if (!modulesNode) return null;
  for (const childId of modulesNode.childrenOrders) {
    const child = modulesNode.children[childId];
    if (!child) continue;
    if (child.isModuleRoot && child.id === moduleId) {
      return child;
    }
  }
  return null;
}

function isOpenablePage(node: SiteLayoutTree): boolean {
  return !!node.layoutUrl && node.hasAccess !== false;
}

/** The first page the caller may open under `node`, in menu order. */
function findPage(
  node: SiteLayoutTree,
  accepts: (page: SiteLayoutTree) => boolean,
): SiteLayoutTree | null {
  if (isOpenablePage(node) && accepts(node)) return node;
  for (const childId of node.childrenOrders) {
    const child = node.children[childId];
    if (!child || child.hasAccess === false) continue;
    const found = findPage(child, accepts);
    if (found) return found;
  }
  return null;
}

/**
 * The page a module opens on: its `landingPage` when the caller may open it,
 * else its first page in menu order.
 */
export function resolveModuleLandingSlug(
  tree: SiteLayoutTree | undefined,
  moduleId: string,
  landingPage: string | undefined,
): string | null {
  const moduleRoot = findModuleRootNode(tree, moduleId);
  if (!moduleRoot) return null;
  const declared = landingPage
    ? findPage(moduleRoot, (page) => page.id === landingPage)
    : null;
  return (declared ?? findPage(moduleRoot, () => true))?.fullSlug ?? null;
}
