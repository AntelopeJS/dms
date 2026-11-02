import { pageMetadataByFullId } from "@antelopejs/interface-dms/page/internal/registry";
import { warnOnceFor } from "../../../store/frontend";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  DynamicMenuProviderInfo,
  DynamicMenuItem,
  PageInfo,
} from "@antelopejs/interface-dms/page";
import { withResolverTimeout } from "../resolver-timeout";
import { ownValue, pagesBySlug, WILDCARD_PERMISSION } from "../../../utils";
import { fillRouteParams } from "../route-params";
import type {
  SiteLayoutTree,
  RequestAccessContext,
  DynamicChildren,
  NavigationEntry,
  ResolvedEntryTarget,
} from "./types";
import {
  computeEntryAccess,
  selectEntryContext,
  redactPresentation,
} from "./access";
import {
  holdsContainerWithoutEntry,
  sortChildIdsByOrder,
  isContainerWithoutEntry,
  findNavigationEntryByFullId,
} from "./registry";
import { nodeProviders, dynamicMenuProviders, nodeTargets } from "./state";

export async function addAccessToTree(
  node: SiteLayoutTree,
  context: RequestAccessContext,
  isRoot: boolean,
  dynamic: DynamicChildren,
): Promise<SiteLayoutTree> {
  const isGranted = isRoot ? true : await computeEntryAccess(node, context);

  const childrenWithAccess = await buildChildrenWithAccess(
    node,
    context,
    dynamic,
  );

  const visible = isGranted ? node : redactPresentation(node);

  const dynamicChildren = dynamic.get(node.fullId);
  const children = dynamicChildren
    ? mergeDynamicChildren(node.fullId, childrenWithAccess, dynamicChildren)
    : childrenWithAccess;
  const hasAccess =
    isGranted &&
    (isRoot ||
      (leadsSomewhere(node, children) &&
        !(await hidesEveryBlock(node, context))));
  if (!dynamicChildren && !holdsContainerWithoutEntry(node)) {
    return { ...visible, hasAccess, children };
  }
  return {
    ...visible,
    hasAccess,
    children,
    childrenOrders: sortChildIdsByOrder(children),
  };
}

export function leadsSomewhere(
  node: SiteLayoutTree,
  children: Record<string, SiteLayoutTree>,
): boolean {
  return !!node.layoutUrl || Object.values(children).some(reachesPage);
}

export function reachesPage(node: SiteLayoutTree): boolean {
  return (
    node.hasAccess !== false || Object.values(node.children).some(reachesPage)
  );
}

export async function hidesEveryBlock(
  entry: NavigationEntry,
  context: RequestAccessContext,
): Promise<boolean> {
  if (!entry.layoutUrl) return false;
  const effective = selectEntryContext(entry, context);
  if (effective.isOwner) return false;
  const page = pageMetadataByFullId.get(entry.fullId);
  return (await page?.HidesEveryComponent(effective.permissions)) ?? false;
}

export async function listsEntry(
  entry: NavigationEntry,
  context: RequestAccessContext,
): Promise<boolean> {
  if (!(await computeEntryAccess(entry, context))) return false;
  return !(await hidesEveryBlock(entry, context));
}

export async function buildChildrenWithAccess(
  node: SiteLayoutTree,
  context: RequestAccessContext,
  dynamic: DynamicChildren,
): Promise<Record<string, SiteLayoutTree>> {
  const children: Record<string, SiteLayoutTree> = {};
  const hoisted: Array<[string, SiteLayoutTree]> = [];
  for (const [key, child] of Object.entries(node.children)) {
    if (isContainerWithoutEntry(child)) {
      const held = await buildChildrenWithAccess(child, context, dynamic);
      hoisted.push(...Object.entries(held));
      continue;
    }
    children[key] = await addAccessToTree(child, context, false, dynamic);
  }
  for (const [key, entry] of hoisted) {
    const existing = ownValue(children, key);
    if (existing) {
      warnHoistedCollision(entry, existing);
      continue;
    }
    children[key] = entry;
  }
  return children;
}

export function warnHoistedCollision(
  hoisted: SiteLayoutTree,
  existing: SiteLayoutTree,
): void {
  const source = findNavigationEntryByFullId(hoisted.fullId);
  if (!source) return;
  warnOnceFor(
    source,
    "hoisted-collision",
    `[dms] "${hoisted.fullId}" hangs under an unregistered category and collides with "${existing.fullId}" at its parent's level: it was left out of the menu.`,
  );
}

export function mergeDynamicChildren(
  categoryFullId: string,
  children: Record<string, SiteLayoutTree>,
  dynamicChildren: SiteLayoutTree[],
) {
  const merged = { ...children };

  const category = findNavigationEntryByFullId(categoryFullId);
  for (const node of dynamicChildren) {
    if (merged[node.id]) {
      const source = nodeProviders.get(node) ?? category;
      if (source) {
        warnOnceFor(
          source,
          "colliding-entry",
          `[dms] dynamic menu entry "${node.id}" of category "${categoryFullId}" collides with an existing entry and was skipped.`,
        );
      }
      continue;
    }
    merged[node.id] = node;
  }
  return merged;
}

export async function resolveDynamicChildren(
  user: User | undefined,
  tenantId: string,
  context: RequestAccessContext,
): Promise<DynamicChildren> {
  const resolved: DynamicChildren = new Map();

  const providers = [...dynamicMenuProviders];
  const perProvider = await Promise.all(
    providers.map((provider) =>
      resolveProviderNodes(provider, user, tenantId, context),
    ),
  );
  for (const [index, provider] of providers.entries()) {
    const nodes = perProvider[index];
    if (!nodes || nodes.length === 0) continue;
    const existing = resolved.get(provider.categoryFullId);
    if (existing) {
      existing.push(...nodes);
      continue;
    }
    resolved.set(provider.categoryFullId, nodes);
  }
  return resolved;
}

export async function resolveProviderNodes(
  provider: DynamicMenuProviderInfo,
  user: User | undefined,
  tenantId: string,
  context: RequestAccessContext,
): Promise<SiteLayoutTree[]> {
  const parent = findNavigationEntryByFullId(provider.categoryFullId);
  if (!parent) {
    warnOnceFor(
      provider,
      "unknown-category",
      `[dms] dynamic menu provider targets unknown category "${provider.categoryFullId}" and was skipped.`,
    );
    return [];
  }
  if (!(await computeEntryAccess(parent, context))) {
    return [];
  }
  const items = await runDynamicMenuResolver(
    provider,
    user,
    tenantId,
    selectEntryContext(parent, context).permissions,
  );
  return buildDynamicNodes(provider, items, context);
}

export async function runDynamicMenuResolver(
  provider: DynamicMenuProviderInfo,
  user: User | undefined,
  tenantId: string,
  permissions: Set<string>,
): Promise<DynamicMenuItem[]> {
  try {
    return await withResolverTimeout(
      Promise.resolve(provider.resolver(user, tenantId, permissions)),
      `category "${provider.categoryFullId}"`,
    );
  } catch (error) {
    warnOnceFor(
      provider,
      "resolver-failed",
      `[dms] dynamic menu provider of category "${provider.categoryFullId}" failed: ${String(error)}`,
    );
    return [];
  }
}

export const ID_SEPARATOR = ".";

export function resolveEntryTarget(
  provider: DynamicMenuProviderInfo,
  item: DynamicMenuItem,
): ResolvedEntryTarget | undefined {
  const entry = `[dms] dynamic menu entry "${item.id}" of category "${provider.categoryFullId}"`;

  if (item.id.includes(ID_SEPARATOR)) {
    warnOnceFor(
      provider,
      "dotted-id",
      `${entry} has a dot in its id and was skipped.`,
    );
    return undefined;
  }
  const target = pagesBySlug[item.fullSlug];
  if (!target) {
    warnOnceFor(
      provider,
      "unregistered-target",
      `${entry} targets unregistered page "${item.fullSlug}" and was skipped.`,
    );
    return undefined;
  }
  const link = fillRouteParams(item.fullSlug, item.params);
  if (link === undefined) {
    warnOnceFor(
      provider,
      "unmatched-route-params",
      `${entry} does not fill exactly the route parameters of "${item.fullSlug}" and was skipped.`,
    );
    return undefined;
  }
  return { target, link };
}

const MAX_DYNAMIC_MENU_DEPTH = 3;

interface DynamicWalk {
  provider: DynamicMenuProviderInfo;
  context: RequestAccessContext;
  targetAccess: Map<string, boolean>;
}

interface DynamicLevel {
  parentFullId: string;
  depth: number;
}

export function buildDynamicNodes(
  provider: DynamicMenuProviderInfo,
  items: readonly DynamicMenuItem[],
  context: RequestAccessContext,
): Promise<SiteLayoutTree[]> {
  return buildDynamicLevel(
    { provider, context, targetAccess: new Map() },
    { parentFullId: provider.categoryFullId, depth: 1 },
    items,
  );
}

async function buildDynamicLevel(
  walk: DynamicWalk,
  level: DynamicLevel,
  items: readonly DynamicMenuItem[],
): Promise<SiteLayoutTree[]> {
  const { provider, context, targetAccess } = walk;
  const nodes: SiteLayoutTree[] = [];
  for (const item of items) {
    const resolved = resolveEntryTarget(provider, item);
    if (!resolved) continue;
    const { target } = resolved;
    if (!(await isTargetPageReachable(target, context, targetAccess))) {
      continue;
    }
    if (
      item.permissionId &&
      !clientHoldsPermission(context, item.permissionId)
    ) {
      continue;
    }
    const node = await buildDynamicNode(walk, level, item, resolved);
    nodeProviders.set(node, provider);
    nodeTargets.set(node, target);
    nodes.push(node);
  }
  return nodes;
}

export function clientHoldsPermission(
  context: RequestAccessContext,
  permissionId: string,
): boolean {
  const { permissions } = context.client;
  return permissions.has(WILDCARD_PERMISSION) || permissions.has(permissionId);
}

export async function isTargetPageReachable(
  target: PageInfo,
  context: RequestAccessContext,
  cache: Map<string, boolean>,
): Promise<boolean> {
  const cached = cache.get(target.fullSlug);
  if (cached !== undefined) return cached;
  const reachable = await computeEntryAccess(target, context);
  cache.set(target.fullSlug, reachable);
  return reachable;
}

export async function buildDynamicNode(
  walk: DynamicWalk,
  level: DynamicLevel,
  item: DynamicMenuItem,
  resolved: ResolvedEntryTarget,
): Promise<SiteLayoutTree> {
  const {
    id,
    permissionId: _permissionId,
    params: _params,
    children: _children,
    ...menuFields
  } = item;
  const fullId = `${level.parentFullId}.${id}`;
  const children = await buildDynamicChildRecord(walk, level, item, fullId);
  return {
    ...menuFields,
    fullSlug: resolved.link,
    id,
    fullId,
    layoutUrl: resolved.target.layoutUrl,
    type: "link",
    category: undefined,
    children,
    childrenOrders: sortChildIdsByOrder(children),
    hasAccess: true,
  };
}

async function buildDynamicChildRecord(
  walk: DynamicWalk,
  level: DynamicLevel,
  item: DynamicMenuItem,
  fullId: string,
): Promise<Record<string, SiteLayoutTree>> {
  if (!item.children?.length) return {};
  if (level.depth >= MAX_DYNAMIC_MENU_DEPTH) {
    warnOnceFor(
      walk.provider,
      "too-deep",
      `[dms] dynamic menu entry "${fullId}" exceeds the maximum depth of ${MAX_DYNAMIC_MENU_DEPTH}: its children were skipped.`,
    );
    return {};
  }
  const nodes = await buildDynamicLevel(
    walk,
    { parentFullId: fullId, depth: level.depth + 1 },
    item.children,
  );
  const children = new Map<string, SiteLayoutTree>();
  for (const node of nodes) {
    if (children.has(node.id)) {
      warnOnceFor(
        walk.provider,
        "duplicate-child-id",
        `[dms] dynamic menu entry "${node.id}" under "${fullId}" duplicates a sibling and was skipped.`,
      );
      continue;
    }
    children.set(node.id, node);
  }
  return Object.fromEntries(children);
}
