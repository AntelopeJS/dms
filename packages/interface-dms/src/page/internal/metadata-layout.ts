/** @internal */
import {
  ControllerMeta,
  RegisterRoute,
  UnregisterRoute,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type { ComponentInfoSerialized } from "../../component";
import type { PageMetadata } from "../metadata";
import type {
  PageInfo,
  PageLayout,
  PageLayoutHandler,
  PageLayoutRequest,
} from "../types";
import {
  type PageRegistration,
  type RouteCallbackContext,
} from "./page-registration";
import { pageLayoutHandlers } from "./registry";

/** @internal */
export function hiddenComponentsFlag(
  declared: Record<string, ComponentInfoSerialized>,
  served: Record<string, ComponentInfoSerialized>,
): Pick<PageLayout, "allComponentsHidden"> {
  const hidesAll =
    Object.keys(declared).length > 0 && Object.keys(served).length === 0;
  return hidesAll ? { allComponentsHidden: true } : {};
}

/** @internal */
export function registerLayoutRoute(
  target: () => PageMetadata["target"],
  pageInfo: PageInfo,
  registration: () => PageRegistration,
  resolvePageLayout: (request: PageLayoutRequest) => Promise<PageLayout>,
  resolveGatedPageLayout: (
    request: PageLayoutRequest,
    options?: { enforceTenantAccessGate?: boolean },
  ) => Promise<PageLayout>,
): void {
  const apimeta = GetMetadata(target(), ControllerMeta);
  const handler: PageLayoutHandler = (request) =>
    resolveGatedPageLayout(request, { enforceTenantAccessGate: true });
  pageLayoutHandlers.set(pageInfo.fullSlug, handler);
  const routeId = RegisterRoute({
    location: pageInfo.layoutUrl,
    callback: async function (this: RouteCallbackContext) {
      return resolvePageLayout({
        user: this.user,
        memberModel: this.memberModel,
        roleModel: this.roleModel,
        tenantId: this.tenantId,
        query: this.pageQuery,
        params: this.pageParams,
      });
    },
    method: "GET",
    mode: "handler",
    parameters: [],
    properties: apimeta.computed_props,
    proto: target().prototype,
  });
  registration().track(() => {
    if (pageLayoutHandlers.get(pageInfo.fullSlug) === handler) {
      pageLayoutHandlers.delete(pageInfo.fullSlug);
    }
    UnregisterRoute(routeId);
  });
}
