import type { ControllerClass } from "@antelopejs/interface-api";
import {
  type Component,
  ComponentTarget,
  type ComponentTargetInput,
  getPermissionIdRef,
} from "../component";
import type { PageLayoutHandler } from "./types";
import {
  pageLayoutHandlers,
  pageMetadataByFullId,
  permissionMap,
} from "./internal/registry";

getPermissionIdRef.get = (component: Component) => permissionMap.get(component);

/** Resolve every live page position of a reusable component. */
export function GetComponentPermissionIds(component: Component): string[] {
  return [...pageMetadataByFullId.values()].flatMap((page) =>
    page.ComponentPermissionIds(component),
  );
}

export function GetPageLayoutBySlug(
  slug: string,
): PageLayoutHandler | undefined {
  return pageLayoutHandlers.get(slug);
}

/**
 * Drop the layout handler a page registered.
 *
 * Called when the page unregisters: the handler is reachable by slug through
 * `/dms/pagelayout`, so leaving it behind keeps serving the layout of a page
 * that is already gone from the registry, the navigation tree and its own
 * route — an unloaded module's screens would still answer.
 *
 * @param slug Full slug the page registered under
 */
export function ClearPageLayoutBySlug(slug: string): void {
  pageLayoutHandlers.delete(slug);
}

/**
 * Ids of every registered page, sorted. The id of a page is what
 * `@RegisterPageExtension` takes, and also its permission id.
 */
export function GetRegisteredPageIds(): string[] {
  return [...pageMetadataByFullId.keys()].sort();
}

/** Resolve the permission id of a page, component, or exact child position. */
export function GetPermissionId(
  target: ComponentTargetInput | ControllerClass,
): string | undefined {
  if (target instanceof ComponentTarget) {
    const rootPermissionId = permissionMap.get(target.root);
    if (!rootPermissionId) return undefined;
    return [rootPermissionId, ...target.path].join(".");
  }
  return permissionMap.get(target);
}
