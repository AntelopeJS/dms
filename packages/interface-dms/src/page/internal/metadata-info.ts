/** @internal @packageDocumentation */
import { DefaultLayout } from "../../component-options/page-layout";
import type { ComponentInfo } from "../../component";
import type { PageMetadata } from "../metadata";
import { pageRoutePath } from "../page-routes";
import type { CategoryInfo, MenuOptions, PageInfo } from "../types";
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
    ...inheritedAccess(menu, resolvedCategory),
  };

  page.layout =
    pageLayout ??
    menu.layout ??
    resolveInheritedLayout(resolvedCategory) ??
    DefaultLayout();
  page.pageInfo = pageInfo;
}

type InheritedAccess = Pick<
  PageInfo,
  | "hidden"
  | "publicAccess"
  | "authOnly"
  | "memberAccess"
  | "bypassTenantAccessGate"
  | "ownerOnly"
>;

function inheritedAccess(
  menu: MenuOptions,
  category: CategoryInfo | undefined,
): InheritedAccess {
  const access: InheritedAccess = {
    hidden: menu.hidden || category?.hidden,
    publicAccess: menu.publicAccess || category?.publicAccess,
    authOnly: menu.authOnly || category?.authOnly,
    memberAccess:
      menu.memberAccess || inheritedMemberAccess(category?.memberAccess),
    bypassTenantAccessGate:
      menu.bypassTenantAccessGate || category?.bypassTenantAccessGate,
    ownerOnly: menu.ownerOnly || category?.ownerOnly,
  };
  if (!access.ownerOnly) return access;
  return {
    ...access,
    publicAccess: undefined,
    authOnly: undefined,
    memberAccess: undefined,
  };
}
