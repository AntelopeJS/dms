/** @internal */
import { UnregisterPermission } from "../../permissions";
// oxlint-disable-next-line import/no-cycle -- The category proxies are used only when a page publishes, after metadata evaluation.
import { internal, isInsideModule } from "../categories";
import type { PageMetadata } from "../metadata";
import type { PageInfo } from "../types";
import {
  RequestQueryProperty,
  RequestRouteParametersProperty,
} from "./metadata-helpers";
import type { PageRegistration } from "./page-registration";
import {
  pageMetadataByFullId,
  permissionMap,
  stampPageRegistration,
} from "./registry";

interface PublishContext {
  registration(): PageRegistration;
  configure(moduleScoped: boolean, skipPermissions: () => boolean): void;
  registerPermission(info: PageInfo): void;
  permissionId(): string;
  registeredPermission(): boolean;
  clearRegisteredPermission(): void;
  ownsPermissions(): boolean;
  ownProperties(): void;
  auth(info: PageInfo): void;
  route(info: PageInfo): void;
}

/** @internal */
export function publish(
  page: PageMetadata,
  pageInfo: PageInfo,
  context: PublishContext,
): void {
  const previous = pageMetadataByFullId.get(pageInfo.fullId);
  pageMetadataByFullId.set(pageInfo.fullId, page);
  context.registration().track(() => {
    if (pageMetadataByFullId.get(pageInfo.fullId) === page)
      pageMetadataByFullId.delete(pageInfo.fullId);
  });
  if (previous && previous !== page) previous.Dispose();
  stampPageRegistration(pageInfo);
  internal.RegisterPage.register(pageInfo);
  context
    .registration()
    .track(() => internal.RegisterPage.unregister(pageInfo));
  context.configure(
    isInsideModule(pageInfo),
    () =>
      pageInfo.noComponentPermissions === true || pageInfo.authOnly === true,
  );
  context.registerPermission(pageInfo);
  permissionMap.set(page.target, context.permissionId());
  context.registration().track(() => {
    permissionMap.delete(page.target);
    if (!context.ownsPermissions()) return;
    if (context.registeredPermission() && context.permissionId()) {
      UnregisterPermission(context.permissionId());
      context.clearRegisteredPermission();
    }
  });
  context.ownProperties();
  context.auth(pageInfo);
  RequestQueryProperty()(page.target.prototype, "pageQuery");
  RequestRouteParametersProperty()(page.target.prototype, "pageParams");
  context.route(pageInfo);
}

/** @internal */
export function mergeMetadata<T extends object>(
  src?: T,
  dst?: T,
): T | undefined {
  if (src) {
    if (dst) return { ...dst, ...src };
    else return { ...src };
  } else return dst;
}
