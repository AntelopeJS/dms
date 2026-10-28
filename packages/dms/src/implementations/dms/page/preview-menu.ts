import { WILDCARD_PERMISSION, pagesBySlug, runInBatches } from "../../../utils";
import {
  type PreviewMenuNode,
  previewCacheKey,
  type PreviewMenuStates,
  aggregatePreviewMenu,
  findQuickActionsHiddenByPreview,
} from "../permission-preview";
import {
  type PageInfo,
  GetPageLayoutBySlug,
} from "@antelopejs/interface-dms/page";
import { getQuickActionsForUser } from "../quick-actions";
import type {
  RequestAccessContext,
  AccessContext,
  DynamicChildren,
  SiteLayoutTree,
  PreviewMenuReading,
  PreviewPageLossCheck,
  PermissionPreviewGrants,
  PreviewPageReading,
  PermissionPreviewRequest,
  PermissionPreviewAccess,
} from "./types";
import {
  buildDeniedAccessContext,
  computeEntryAccess,
  buildAccessContext,
} from "./access";
import { categoriesByFullId, nodeTargets, navigationTree } from "./state";
import {
  listsEntry,
  addAccessToTree,
  resolveDynamicChildren,
} from "./dynamic-menu";
import { previewLossCacheFor, PREVIEW_PAGE_CONCURRENCY } from "./preview-cache";
import { previewStructureVersion } from "./notifications";
import { memoizeViewerModels } from "./preview-models";
import {
  viewerLayoutsFor,
  readPreviewPage,
  resolvePreviewPage,
} from "./preview-pages";
import { resolveQuickActionTarget } from "./quick-action-access";

export function buildPreviewAccessContext(
  previewPermissions: Set<string>,
  real: RequestAccessContext,
): RequestAccessContext {
  const preview: AccessContext = {
    permissions: previewPermissions,
    isOwner: previewPermissions.has(WILDCARD_PERMISSION),
    isAuthenticated: true,
  };
  if (!real.gateDenied) {
    return {
      gated: preview,
      ungated: preview,
      client: preview,
      gateDenied: false,
      entryAccess: new Map(),
    };
  }
  return buildDeniedAccessContext(preview);
}

export async function findRegisteredEntriesHiddenByPreview(
  real: RequestAccessContext,
  preview: RequestAccessContext,
): Promise<string[]> {
  const entries = [
    ...Object.values(pagesBySlug),
    ...Object.values(categoriesByFullId),
  ];
  const hidden: string[] = [];
  for (const entry of entries) {
    if (!(await listsEntry(entry, real))) continue;
    if (!(await listsEntry(entry, preview))) hidden.push(entry.fullId);
  }
  return hidden;
}

export function findDynamicEntriesHiddenByPreview(
  served: DynamicChildren,
  previewed: DynamicChildren,
): string[] {
  const kept = new Set(
    flattenDynamicNodes(previewed).map((node) => node.fullId),
  );
  return flattenDynamicNodes(served)
    .map((node) => node.fullId)
    .filter((fullId) => !kept.has(fullId));
}

function flattenDynamicNodes(served: DynamicChildren): SiteLayoutTree[] {
  const flatten = (node: SiteLayoutTree): SiteLayoutTree[] => [
    node,
    ...Object.values(node.children).flatMap(flatten),
  ];
  return [...served.values()].flatMap((nodes) => nodes.flatMap(flatten));
}

export function collectPreviewMenuNodes(
  node: SiteLayoutTree,
  pageIds: ReadonlySet<string>,
): PreviewMenuNode[] {
  return Object.values(node.children).flatMap((child) => {
    const children = collectPreviewMenuNodes(child, pageIds);
    if (!child.hasAccess) return children;
    return [
      {
        fullId: child.fullId,
        opensPage: pageIds.has(child.fullId) || nodeTargets.has(child),
        children,
      },
    ];
  });
}

export function flattenPreviewMenuNodes(
  nodes: PreviewMenuNode[],
): PreviewMenuNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenPreviewMenuNodes(node.children),
  ]);
}

export async function findPagesLosingInPreview(
  pages: PageInfo[],
  reading: PreviewMenuReading,
  check: PreviewPageLossCheck,
): Promise<Set<string>> {
  const { request, contexts, quickActions } = reading;
  const grants: PermissionPreviewGrants = {
    real: contexts.real.ungated.permissions,
    preview: request.previewPermissions,
  };
  const answers = previewLossCacheFor(check).pagesFor(
    previewCacheKey({
      tenantId: request.tenantId,
      userId: request.user._id,
      structureVersion: previewStructureVersion,
      real: grants.real,
      preview: grants.preview,
    }),
  );
  const pageReading: PreviewPageReading = {
    request: {
      ...request,
      ...memoizeViewerModels(request.memberModel, request.roleModel),
    },
    hiddenInPreview: false,
    quickActions,
    layouts: viewerLayoutsFor(request, contexts.real),
  };
  const losing = new Set<string>();
  await runInBatches(pages, PREVIEW_PAGE_CONCURRENCY, async (route) => {
    let answer = answers.get(route.fullId);
    if (!answer) {
      const handler = GetPageLayoutBySlug(route.fullSlug);
      answer = handler
        ? readPreviewPage(route, handler, pageReading)
            .then((page) => check(page, grants))
            .catch(() => false)
        : Promise.resolve(false);
      answers.set(route.fullId, answer);
    }
    if (await answer) losing.add(route.fullId);
  });
  return losing;
}

export function listPreviewLossTargets(
  nodes: PreviewMenuNode[],
  reading: PreviewMenuReading,
  pagesByFullId: Map<string, PageInfo>,
) {
  const { served, denied } = reading;
  const pages = new Map<string, PageInfo>();
  const entryTargets = new Map<string, string>();
  for (const node of flattenPreviewMenuNodes(nodes)) {
    const page = pagesByFullId.get(node.fullId);
    if (page && !denied.has(page.fullId)) pages.set(page.fullId, page);
  }
  for (const node of flattenDynamicNodes(served)) {
    const target = nodeTargets.get(node);
    if (!target || denied.has(node.fullId) || denied.has(target.fullId)) {
      continue;
    }
    pages.set(target.fullId, target);
    entryTargets.set(node.fullId, target.fullId);
  }
  return { pages: [...pages.values()], entryTargets };
}

export async function aggregatePreviewMenuStates(
  reading: PreviewMenuReading,
): Promise<PreviewMenuStates> {
  const { request, contexts, served, denied } = reading;
  const tree = await addAccessToTree(
    navigationTree,
    contexts.real,
    true,
    served,
  );
  const pagesByFullId = new Map(
    Object.values(pagesBySlug).map((page) => [page.fullId, page]),
  );
  const nodes = collectPreviewMenuNodes(tree, new Set(pagesByFullId.keys()));
  const losesInside = new Set<string>();
  if (request.pageLoses) {
    const { pages, entryTargets } = listPreviewLossTargets(
      nodes,
      reading,
      pagesByFullId,
    );
    const losing = await findPagesLosingInPreview(
      pages,
      reading,
      request.pageLoses,
    );
    for (const fullId of losing) losesInside.add(fullId);
    for (const [entry, target] of entryTargets) {
      if (losing.has(target)) losesInside.add(entry);
    }
  }
  return aggregatePreviewMenu(
    nodes,
    denied,
    losesInside,
    await findUniversalPreviewPages(pagesByFullId, contexts.real),
  );
}

export async function findUniversalPreviewPages(
  pagesByFullId: Map<string, PageInfo>,
  real: RequestAccessContext,
): Promise<Set<string>> {
  const empty = buildPreviewAccessContext(new Set(), real);
  const universal = new Set<string>();
  for (const [fullId, page] of pagesByFullId) {
    if (await computeEntryAccess(page, empty)) universal.add(fullId);
  }
  return universal;
}

/**
 * Read the menu and a page as a permission set would see them, without ever
 * leaving the viewer's own access: only entries the viewer reaches are
 * compared, and the page layouts are the ones the viewer is served — read on
 * the server, never sent. Nothing about the session changes — this is how the
 * roles editor previews a role.
 *
 * Dynamic menu entries are compared by running their providers for the viewer
 * under both sets.
 */
export async function resolvePermissionPreviewAccess(
  request: PermissionPreviewRequest,
): Promise<PermissionPreviewAccess> {
  const { path, user, memberModel, roleModel, tenantId } = request;
  const real = await buildAccessContext(user, memberModel, roleModel, tenantId);
  const preview = buildPreviewAccessContext(request.previewPermissions, real);
  const contexts = { real, preview };
  const [realQuickActions, previewQuickActions, served, previewed] =
    await Promise.all([
      getQuickActionsForUser((target) =>
        resolveQuickActionTarget(target, real),
      ),
      getQuickActionsForUser((target) =>
        resolveQuickActionTarget(target, preview),
      ),
      resolveDynamicChildren(user, tenantId, real),
      resolveDynamicChildren(user, tenantId, preview),
    ]);
  const quickActions = { real: realQuickActions, preview: previewQuickActions };
  const [registeredHidden, page] = await Promise.all([
    findRegisteredEntriesHiddenByPreview(real, preview),
    path
      ? resolvePreviewPage(path, request, contexts, quickActions)
      : Promise.resolve(null),
  ]);
  const denied = new Set([
    ...registeredHidden,
    ...findDynamicEntriesHiddenByPreview(served, previewed),
  ]);
  const states = await aggregatePreviewMenuStates({
    request,
    contexts,
    quickActions,
    served,
    denied,
  });
  return {
    hiddenEntries: states.hidden,
    partialEntries: states.partial,
    hiddenQuickActions: findQuickActionsHiddenByPreview(
      realQuickActions,
      previewQuickActions,
    ),
    page,
  };
}
