/** @internal */
import { UnregisterPermission } from "../../permissions";
import { internal, isOwnerOnly } from "../categories";
import type { PageMetadata } from "../metadata";
import type { PageInfo } from "../types";
import {
  RequestQueryProperty,
  RequestRouteParametersProperty,
} from "./metadata-helpers";
import type { PageRegistration } from "./page-registration";
import { pageController } from "./page-controller";
import {
  pageMetadataByFullId,
  permissionMap,
  stampPageRegistration,
} from "./registry";
import { prototypeOf } from "../../utils/internal/decorated-class";

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
  const controller = pageController(page.target);
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
    isOwnerOnly(pageInfo),
    () =>
      pageInfo.noComponentPermissions === true || pageInfo.authOnly === true,
  );
  context.registerPermission(pageInfo);
  permissionMap.set(controller, context.permissionId());
  context.registration().track(() => {
    permissionMap.delete(controller);
    if (!context.ownsPermissions()) return;
    if (context.registeredPermission() && context.permissionId()) {
      UnregisterPermission(context.permissionId());
      context.clearRegisteredPermission();
    }
  });
  context.ownProperties();
  context.auth(pageInfo);
  RequestQueryProperty()(prototypeOf(controller), "pageQuery");
  RequestRouteParametersProperty()(prototypeOf(controller), "pageParams");
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
