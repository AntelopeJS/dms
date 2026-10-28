import {
  internal as pageInternal,
  reportMissingCategories as reportMissingCategoriesImplementation,
  cancelMissingCategoryCheck as cancelMissingCategoryCheckImplementation,
  GetMenuOrder as getMenuOrderImplementation,
  GetCategoryPermissionIds as getCategoryPermissionIdsImplementation,
  GetMenuEntryPermissionIds as getMenuEntryPermissionIdsImplementation,
} from "./page/registry";
import { DMSController as PageDMSController } from "./page/controller";
import {
  NotifyMenuChanged as notifyMenuChangedImplementation,
  notifyMenuAccessChanged as notifyMenuAccessChangedImplementation,
  cancelPendingMenuNotifications as cancelPendingMenuNotificationsImplementation,
} from "./page/notifications";
import {
  pageParamsOf as pageParamsOfImplementation,
  buildPagePayload as buildPagePayloadImplementation,
  buildSiteLayoutPayload as buildSiteLayoutPayloadImplementation,
  buildNavBadges as buildNavBadgesImplementation,
} from "./page/payloads";
import { resolvePreviewPermissions as resolvePreviewPermissionsImplementation } from "./page/preview-models";
import { resolvePermissionPreviewAccess as resolvePermissionPreviewAccessImplementation } from "./page/preview-menu";
import {
  isPlatformPage as isPlatformPageImplementation,
  userCanAccessPage as userCanAccessPageImplementation,
  filterPermissionsForBypassedSurfaces as filterPermissionsForBypassedSurfacesImplementation,
  resolveUserPermissions as resolveUserPermissionsImplementation,
  isPlatformOwner as isPlatformOwnerImplementation,
} from "./page/access";

export { AddFrontendModule, GetFrontendModules } from "../../store/frontend";
export const internal = pageInternal;
export const DMSController = PageDMSController;
export type DMSController = PageDMSController;
export const isPlatformPage = isPlatformPageImplementation;
export const userCanAccessPage = userCanAccessPageImplementation;
export const reportMissingCategories = reportMissingCategoriesImplementation;
export const cancelMissingCategoryCheck =
  cancelMissingCategoryCheckImplementation;
export const GetMenuOrder = getMenuOrderImplementation;
export const GetCategoryPermissionIds = getCategoryPermissionIdsImplementation;
export const GetMenuEntryPermissionIds =
  getMenuEntryPermissionIdsImplementation;
export const NotifyMenuChanged = notifyMenuChangedImplementation;
export const notifyMenuAccessChanged = notifyMenuAccessChangedImplementation;
export const cancelPendingMenuNotifications =
  cancelPendingMenuNotificationsImplementation;
export type { SiteLayoutPayload } from "./page/types";
export type { PagePayload } from "./page/types";
export type { PageResponsePayload } from "./page/types";
export const pageParamsOf = pageParamsOfImplementation;
export const buildPagePayload = buildPagePayloadImplementation;
export type { PermissionPreviewPage } from "./page/types";
export type { PermissionPreviewGrants } from "./page/types";
export type { PreviewPageLossCheck } from "./page/types";
export type { PermissionPreviewAccess } from "./page/types";
export type { PermissionPreviewRequest } from "./page/types";
export const resolvePreviewPermissions =
  resolvePreviewPermissionsImplementation;
export const resolvePermissionPreviewAccess =
  resolvePermissionPreviewAccessImplementation;
export const filterPermissionsForBypassedSurfaces =
  filterPermissionsForBypassedSurfacesImplementation;
export const resolveUserPermissions = resolveUserPermissionsImplementation;
export const buildSiteLayoutPayload = buildSiteLayoutPayloadImplementation;
export const buildNavBadges = buildNavBadgesImplementation;
export const isPlatformOwner = isPlatformOwnerImplementation;
