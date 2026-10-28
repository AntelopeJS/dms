/** @internal */
import { GetEffectiveUserPermissions } from "../../permissions";
import type { ComponentFilterContext } from "../../component";
import { gateAllowsSurface } from "../../internal/tenant-access";
import { filterComponents } from "../layout-filter";
import type { PageMetadata } from "../metadata";
import type { PageLayout, PageLayoutRequest } from "../types";
import {
  filterLayoutHeaderActions,
  withComponentHeaderButtons,
} from "./layout-filter";
import { hiddenComponentsFlag } from "./metadata-layout";
import { metadataOwner } from "./metadata-owner";
import type { readPageRecord } from "./page-record";
import { withTableViewPlacements } from "./table-view-ids";

/** @internal */
export function registeredLayout(page: PageMetadata): PageLayout {
  const layout = metadataOwner(page).layoutRef;
  if (!layout) throw new Error("PageMetadata not properly initialized");
  return layout;
}

/** @internal */
export function tenantGateRequired(
  page: PageMetadata,
  enforce: boolean,
  user: PageLayoutRequest["user"],
): user is NonNullable<PageLayoutRequest["user"]> {
  return !!(
    enforce &&
    user &&
    page.pageInfo &&
    !gateAllowsSurface(page.pageInfo, true)
  );
}

/** @internal */
export function prepareLayoutContext(
  request: Pick<
    PageLayoutRequest,
    | "user"
    | "memberModel"
    | "roleModel"
    | "tenantId"
    | "query"
    | "params"
    | "resolverContext"
  >,
) {
  const {
    user,
    memberModel,
    roleModel,
    tenantId,
    query,
    params,
    resolverContext,
  } = request;
  const loadPermissions = permissionLoader(
    user,
    memberModel,
    roleModel,
    tenantId,
    resolverContext,
  );
  const context: ComponentFilterContext = { tenantId, user, query, params };
  return { context, loadPermissions };
}

/** @internal */
export function filterPageHeader(
  page: PageMetadata,
  layout: PageLayout,
  load: Parameters<typeof filterLayoutHeaderActions>[1],
  context: ComponentFilterContext,
  read: Awaited<ReturnType<typeof readPageRecord>>,
) {
  return filterLayoutHeaderActions(
    layout.layout,
    load,
    context,
    metadataOwner(page).pagePermissionId,
    read?.status,
  );
}

/** @internal */
export function filterPageComponents(
  page: PageMetadata,
  components: PageLayout["components"],
  permissions: Set<string>,
  context: ComponentFilterContext,
) {
  const owner = metadataOwner(page);
  return filterComponents(
    components,
    owner.pagePermissionId,
    permissions,
    owner.componentMap,
    context,
  );
}

/** @internal */
export function permissionLoader(
  user: PageLayoutRequest["user"],
  memberModel: PageLayoutRequest["memberModel"],
  roleModel: PageLayoutRequest["roleModel"],
  tenantId: PageLayoutRequest["tenantId"],
  resolverContext: PageLayoutRequest["resolverContext"],
) {
  return async (): Promise<Set<string>> => {
    if (!user) return new Set<string>();
    const roleIds = (await memberModel.getByUser(user._id))?.roleIds ?? [];
    return GetEffectiveUserPermissions(
      user,
      tenantId,
      roleIds,
      roleModel,
      resolverContext,
    );
  };
}

/** @internal */
export function prepareLayoutResponse(
  layout: PageLayout,
  components: PageLayout["components"],
) {
  const prefix = { ...layout };
  const assembleHeader = withComponentHeaderButtons;
  return (header: Parameters<typeof withComponentHeaderButtons>[0]) => ({
    ...prefix,
    layout: assembleHeader(header, components),
    components: withTableViewPlacements(components),
  });
}

/** @internal */
export function prepareFilteredLayoutResponse(
  layout: PageLayout,
  declared: PageLayout["components"],
  served: PageLayout["components"],
) {
  const respond = prepareLayoutResponse(layout, served);
  return (header: Parameters<typeof withComponentHeaderButtons>[0]) => ({
    ...respond(header),
    ...hiddenComponentsFlag(declared, served),
  });
}
