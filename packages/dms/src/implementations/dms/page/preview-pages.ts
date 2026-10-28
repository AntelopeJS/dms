import {
  type PageLayoutHandler,
  type PageLayout,
  type PageInfo,
  GetPageLayoutBySlug,
} from "@antelopejs/interface-dms/page";
import {
  type ServedQuickActions,
  readHeaderActions,
  type HeaderActionAccess,
  findHeaderActionsHiddenByPreview,
  previewCacheKey,
} from "../permission-preview";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { resolvePagePermissionId, pagesBySlug } from "../../../utils";
import type {
  PermissionPreviewRequest,
  PreviewPageReading,
  RequestAccessContext,
  PermissionPreviewPage,
} from "./types";
import { previewMemberModels, previewResolverContext } from "./preview-models";
import { viewerLayoutCache } from "./preview-cache";
import { previewStructureVersion } from "./notifications";
import { resolveRegisteredPageSlug } from "./payloads";
import { computeEntryAccess } from "./access";

export async function findPreviewHeaderActions(
  handler: PageLayoutHandler,
  layout: PageLayout,
  request: PermissionPreviewRequest,
  quickActions: { real: ServedQuickActions; preview: ServedQuickActions },
): Promise<string[]> {
  const viewerActions = readHeaderActions(layout.layout);
  if (viewerActions.length === 0) return [];
  const { memberModel, roleModel } = previewMemberModels(
    request.previewPermissions,
  );

  const previewUser: User = Object.assign(Object.create(request.user), {
    owner: false,
  });
  const previewLayout = await handler({
    user: previewUser,
    memberModel,
    roleModel,
    tenantId: request.tenantId,
    resolverContext: previewResolverContext(request.previewPermissions),
  });
  const viewer: HeaderActionAccess = {
    headerActions: viewerActions,
    quickActions: quickActions.real,
  };
  const preview: HeaderActionAccess = {
    headerActions: readHeaderActions(previewLayout.layout),
    quickActions: quickActions.preview,
  };
  return findHeaderActionsHiddenByPreview(viewer, preview);
}

export function readViewerLayout(
  route: PageInfo,
  handler: PageLayoutHandler,
  { request, layouts }: PreviewPageReading,
): Promise<PageLayout> {
  const known = layouts.get(route.fullId);
  if (known) return known;
  const { user, memberModel, roleModel, tenantId } = request;
  const layout = handler({ user, memberModel, roleModel, tenantId });
  layouts.set(route.fullId, layout);
  layout.catch(() => layouts.delete(route.fullId));
  return layout;
}

export function viewerLayoutsFor(
  request: PermissionPreviewRequest,
  real: RequestAccessContext,
): Map<string, Promise<PageLayout>> {
  return viewerLayoutCache.pagesFor(
    previewCacheKey({
      tenantId: request.tenantId,
      userId: request.user._id,
      structureVersion: previewStructureVersion,
      real: real.ungated.permissions,
      preview: [],
    }),
  );
}

export async function readPreviewPage(
  route: PageInfo,
  handler: PageLayoutHandler,
  reading: PreviewPageReading,
): Promise<PermissionPreviewPage> {
  const { request, hiddenInPreview, quickActions } = reading;
  const layout = await readViewerLayout(route, handler, reading);
  return {
    fullId: route.fullId,
    displayName: route.displayName,
    pagePermissionId: resolvePagePermissionId(route.permission, route.fullId),
    filtersComponents:
      route.publicAccess !== true &&
      route.authOnly !== true &&
      route.noComponentPermissions !== true,
    hiddenInPreview,
    components: layout.components,

    hiddenHeaderActions: hiddenInPreview
      ? readHeaderActions(layout.layout).map((action) => action.id)
      : await findPreviewHeaderActions(handler, layout, request, quickActions),
  };
}

export async function resolvePreviewPage(
  path: string,
  request: PermissionPreviewRequest,
  contexts: { real: RequestAccessContext; preview: RequestAccessContext },
  quickActions: { real: ServedQuickActions; preview: ServedQuickActions },
): Promise<PermissionPreviewPage | null> {
  const normalizedSlug = `/${path.replace(/^\/+|\/+$/g, "")}`;
  const registeredSlug = resolveRegisteredPageSlug(normalizedSlug);
  const route = registeredSlug ? pagesBySlug[registeredSlug] : undefined;
  const handler = registeredSlug
    ? GetPageLayoutBySlug(registeredSlug)
    : undefined;
  if (!route || !handler) return null;

  if (!(await computeEntryAccess(route, contexts.real))) return null;
  const hiddenInPreview = !(await computeEntryAccess(route, contexts.preview));
  return readPreviewPage(route, handler, {
    request,
    hiddenInPreview,
    quickActions,
    layouts: viewerLayoutsFor(request, contexts.real),
  });
}
