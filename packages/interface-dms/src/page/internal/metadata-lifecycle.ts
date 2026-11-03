/** @internal */
export { installMetadataOwner } from "./metadata-owner";
// oxlint-disable-next-line import/no-cycle -- Category resolution reads metadata only inside functions after initialization.
export { setPageInfo } from "./metadata-info";
// oxlint-disable-next-line import/no-cycle -- Publication reads category proxies only after metadata initialization.
import { mergeMetadata, publish as publishMetadata } from "./metadata-publish";
import type { Component } from "../../component";
import type { ComponentTreeNode } from "../component-tree";
import type { PageMetadata } from "../metadata";
import type { PageExtensionInfo, PageInfo } from "../types";
import { assembleLayoutComponents } from "./extension-assembly";
import * as components from "./metadata-components";
import { takenComponentKeys } from "./metadata-extensions";
import { metadataOwner } from "./metadata-owner";
import { registerPagePermission } from "./metadata-registration";
import { pageMetadataByFullId } from "./registry";

export { HasPermission } from "../../permissions";
export { ResolveComponentSlots } from "../../internal/component-slots";
export { AssertTenantAccess } from "../../tenant-access";
export { readPageRecord } from "./page-record";
export {
  pageExtensions,
  isPageExtensionRegistered,
  runAsPageExtensionOwner,
  syncTargetExtensions,
} from "./registry";
export { PageRegistration } from "./page-registration";
export { registerLayoutRoute } from "./metadata-layout";
export { isNativeUploadField } from "./metadata-uploads";
export {
  applyAuthDecorators,
  ownRouteProperties,
} from "./metadata-registration";
export { extensionComponentPath } from "./metadata-extensions";
export { actionPermissions } from "./metadata-components";
export {
  prepareUploadOptions,
  prepareUploadRegistration,
  finishUploadRegistration,
} from "./metadata-upload-registration";
export {
  removeStaleExtensions,
  prepareExtensionEntries,
  prepareExtensionComponent,
  reportExtensionFailure,
} from "./metadata-extension-contributions";
export {
  registeredLayout,
  tenantGateRequired,
  prepareLayoutContext,
  filterPageHeader,
  filterPageComponents,
  prepareLayoutResponse,
  prepareFilteredLayoutResponse,
} from "./metadata-layout-response";

/** @internal */
export function inherit(page: PageMetadata, parent: PageMetadata): void {
  page.pageInfo = mergeMetadata(parent.pageInfo, page.pageInfo);
  page.layout = mergeMetadata(parent.layout, page.layout);
  page.components = mergeMetadata(parent.components, page.components) ?? {};
}

/** @internal */
export function componentPermissionIds(
  page: PageMetadata,
  component: Component,
): string[] {
  return [...metadataOwner(page).componentMap.values()]
    .filter((node) => node.component === component && node.access === "own")
    .map((node) => node.permissionId);
}

/** @internal */
export function publish(page: PageMetadata, pageInfo: PageInfo): void {
  const owner = metadataOwner(page);
  publishMetadata(page, pageInfo, {
    registration: () => owner.registration,
    configure: (moduleScoped, skip) => {
      owner.moduleScoped = moduleScoped;
      owner.skipComponentPermissions = skip();
    },
    registerPermission: (info) => {
      owner.pagePermissionId = owner.registerPermission(info);
    },
    permissionId: () => owner.pagePermissionId,
    registeredPermission: () => owner.registeredPagePermission,
    clearRegisteredPermission: () => {
      owner.registeredPagePermission = false;
    },
    ownsPermissions: () => owner.ownsPermissions(),
    ownProperties: () => owner.ownProperties(),
    auth: (info) => owner.auth(info),
    route: (info) => owner.route(info),
  });
}

/** @internal */
export function dispose(page: PageMetadata): void {
  const owner = metadataOwner(page);
  owner.detached = true;
  owner.releaseGate();
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot the keys before drop deletes entries from the same map.
  for (const info of [...owner.extensionEntries.keys()]) owner.drop(info);
  owner.rebuild();
  owner.ownComponents = {};
  owner.registration.dispose();
}

/** @internal */
export function permissionKeys(page: PageMetadata): string[] | undefined {
  const owner = metadataOwner(page);
  if (page.pageInfo?.publicAccess === true || owner.skipComponentPermissions)
    return;
  const keys = Object.keys(owner.layoutRef?.components ?? {});
  return keys.length === 0 ? undefined : keys;
}

/** @internal */
export function registerPermission(page: PageMetadata, info: PageInfo): string {
  const owner = metadataOwner(page);
  return registerPagePermission(
    info,
    () => owner.moduleScoped,
    (registered) => {
      owner.registeredPagePermission = registered;
    },
  );
}

/** @internal */
export function prepareComponent(
  page: PageMetadata,
  component: Component,
  key: string,
): ReturnType<typeof components.prepareComponent> {
  const owner = metadataOwner(page);
  return components.prepareComponent(component, key, {
    permissionId: (key) => owner.permissionId(key),
    trees: () => owner.componentTrees,
    registration: () => owner.registration,
    unregister: (component, key) => owner.unregister(component, key),
    register: (node) => owner.register(node),
    detached: () => owner.detached,
    bind: (serialized, key) => owner.bind(serialized, key),
  });
}

/** @internal */
export function registerComponentNode(
  page: PageMetadata,
  node: ComponentTreeNode,
): void {
  const owner = metadataOwner(page);
  components.registerComponentNode(node, {
    componentMap: () => owner.componentMap,
    pageInfo: () => page.pageInfo,
    registersComponentPermissions: () => owner.registersPermissions(),
    actionPermissions: (component) => owner.actions(component),
    notify: (node) => owner.notify(node),
  });
}

/** @internal */
export function notifyPageCreated(
  page: PageMetadata,
  node: ComponentTreeNode,
): void {
  const owner = metadataOwner(page);
  components.notifyPageCreated(page, node, () => owner.notifiedComponents);
}

/** @internal */
export function ownsPagePermissions(page: PageMetadata): boolean {
  const owner = pageMetadataByFullId.get(page.pageInfo?.fullId ?? "");
  return owner === undefined || owner === page;
}

/** @internal */
export function unregisterComponent(page: PageMetadata, key: string): void {
  const owner = metadataOwner(page);
  components.unregisterComponent(key, {
    trees: () => owner.componentTrees,
    uploads: () => owner.nativeUploadFields,
    nodes: () => owner.componentMap,
    notified: () => owner.notifiedComponents,
    ownsPermissions: () => owner.ownsPermissions(),
    unregister: (node) => owner.unregisterNode(node),
  });
}

/** @internal */
export function unregisterComponentNode(
  page: PageMetadata,
  node: ComponentTreeNode,
): void {
  const owner = metadataOwner(page);
  components.unregisterComponentNode(
    node,
    () => owner.registersPermissions(),
    (node) => owner.actionsForNode(node),
  );
}

/** @internal */
export function takenKeys(page: PageMetadata): Map<string, string> {
  const owner = metadataOwner(page);
  return takenComponentKeys(
    page.pageInfo?.fullId ?? "",
    owner.ownComponents,
    () => owner.extensionEntries,
  );
}

/** @internal */
export function dropExtension(
  page: PageMetadata,
  info: PageExtensionInfo,
): void {
  const owner = metadataOwner(page);
  for (const entry of owner.extensionEntries.get(info) ?? [])
    owner.unregisterExtension(entry);
  owner.extensionEntries.delete(info);
}

/** @internal */
export function rebuildLayoutComponents(page: PageMetadata): void {
  const owner = metadataOwner(page);
  if (!owner.layoutRef) return;
  owner.layoutRef.components = assembleLayoutComponents(
    owner.ownComponents,
    [...owner.extensionEntries.values()].flat(),
  );
}
