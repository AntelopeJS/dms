/** @internal @packageDocumentation */
import { DefaultLayout } from "../../base/layouts";
import type { ComponentInfo } from "../../component";
import type { PageMetadata } from "../metadata";
import { pageRoutePath } from "../page-routes";
import type { MenuOptions, PageInfo } from "../types";
// oxlint-disable-next-line import/no-cycle -- Category resolution reads PageMetadata inside functions, after metadata initialization.
import { resolveCategoryInfo, resolveInheritedLayout } from "./categories";
import { inheritedMemberAccess } from "./member-access";

/** @internal */
export function setPageInfo(
  page: PageMetadata,
  id: string,
  fullSlug: string,
  menuOptions: MenuOptions,
  pageLayout?: ComponentInfo,
): void {
  const { parent, ...menu } = menuOptions;
  const resolvedCategory = resolveCategoryInfo(menu.category);
  const parentFullId = resolvedCategory?.fullId ?? "";
  const fullId = parentFullId ? `${parentFullId}.${id}` : id;

  const location = pageRoutePath(fullSlug, "/pagelayout");

  const pageInfo: PageInfo = {
    ...menu,
    category: resolvedCategory,
    id,
    fullId,
    fullSlug,
    layoutUrl: location,
    parentSlug: parent ? resolveCategoryInfo(parent)?.fullSlug : undefined,
    hidden: menu.hidden || resolvedCategory?.hidden,
    publicAccess: menu.publicAccess || resolvedCategory?.publicAccess,
    authOnly: menu.authOnly || resolvedCategory?.authOnly,
    memberAccess:
      menu.memberAccess ||
      inheritedMemberAccess(resolvedCategory?.memberAccess),
    bypassTenantAccessGate:
      menu.bypassTenantAccessGate || resolvedCategory?.bypassTenantAccessGate,
  };

  page.layout =
    pageLayout ??
    menu.layout ??
    resolveInheritedLayout(resolvedCategory) ??
    DefaultLayout();
  page.pageInfo = pageInfo;
}
