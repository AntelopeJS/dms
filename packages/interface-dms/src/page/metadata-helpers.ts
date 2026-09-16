// The request-tenant decorator and the two module route guards: telling whether
// a page lives inside a module, and logging once that a route was blocked for
// that reason.
//
// Split out of metadata.ts.

import {
  type RequestContext,
  SetParameterProvider,
} from "@antelopejs/interface-api";
import { MakeParameterAndPropertyDecorator } from "@antelopejs/interface-core/decorators";
import { Logging } from "@antelopejs/interface-core/logging";
// Import from the defining leaf, not the dms-base barrel: the barrel pulls in
// table-view, which imports the page interface back — entering through the
// barrel would then call DefaultLayout() while the barrel is still
// mid-evaluation.
import { getRequestTenantId } from "../request-tenant";
// Deliberate and documented above: categories resolve controller
// classes through PageMetadata, and metadata registers pages
// through the proxies declared in categories. Neither module
// dereferences the other while it evaluates.
// oxlint-disable-next-line import/no-cycle
import { MODULE_URL_PREFIX, type PageInfo } from "./types";
export const RequestTenantIdProperty = MakeParameterAndPropertyDecorator(
  (target, key, index) => {
    SetParameterProvider(target, key, index, (ctx: RequestContext) =>
      getRequestTenantId(ctx),
    );
  },
);

export function isPageInsideModule(pageInfo: PageInfo): boolean {
  return pageInfo.fullSlug.startsWith(`${MODULE_URL_PREFIX}/`);
}

const loggedModuleSlugs = new Set<string>();

export function logModuleRouteGated(fullSlug: string): void {
  if (loggedModuleSlugs.has(fullSlug)) return;
  loggedModuleSlugs.add(fullSlug);
  Logging.Info(`[dms] Module route ${fullSlug}/... gated owner-only`);
}
