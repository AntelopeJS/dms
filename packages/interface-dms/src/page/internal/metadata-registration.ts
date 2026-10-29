/** @internal */
import { ControllerMeta } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { AuthOwnerOnly, AuthUser } from "../../auth";
import { Action } from "../../component";
import { RoleModel, TenantMemberModel } from "../../db";
import { AuthUserWithPermission } from "../../guards";
import {
  MarkModuleScopedPermission,
  RegisterPermission,
  type Permission,
} from "../../permissions";
import { TenantScopedModel } from "../../tenant-scoped-model";
import type { PageMetadata } from "../metadata";
import type { PageInfo } from "../types";
import { opensToMembers } from "./member-access";
import {
  isPageInsideModule,
  logModuleRouteGated,
  RequestTenantIdProperty,
} from "./metadata-helpers";

/** @internal */
export function registerPagePermission(
  pageInfo: PageInfo,
  moduleScoped: () => boolean,
  setRegistered: (registered: boolean) => void,
): string {
  const fromAction =
    pageInfo.permission instanceof Action
      ? pageInfo.permission.toPermission()
      : undefined;
  const pagePermission = fromAction ?? {
    id: pageInfo.fullId,
    title: pageInfo.displayName,
    icon: pageInfo.icon,
    defaultGranted:
      pageInfo.publicAccess || opensToMembers(pageInfo.memberAccess),
    ...ownPermission(pageInfo.permission),
  };
  setRegistered(false);
  if (moduleScoped()) {
    MarkModuleScopedPermission(pagePermission.id);
  } else if (!fromAction && pageInfo.authOnly !== true) {
    RegisterPermission(pagePermission.id, pagePermission);
    setRegistered(true);
  }
  return pagePermission.id;
}

function ownPermission(
  permission: PageInfo["permission"],
): Partial<Permission> | undefined {
  return permission instanceof Action ? undefined : permission;
}

/** @internal */
export function ownRouteProperties(target: PageMetadata["target"]): void {
  const properties = GetMetadata(target, ControllerMeta).computed_props;
  for (const [key, property] of Object.entries(properties)) {
    properties[key] = { ...property, modifiers: [...property.modifiers] };
  }
}

/** @internal */
export function applyAuthDecorators(
  page: PageMetadata,
  pageInfo: PageInfo,
): void {
  if (pageInfo.publicAccess === true) return;
  const authOnly = pageInfo.authOnly === true;
  const isModulePage = isPageInsideModule(pageInfo);
  page.guardOptions = {
    bypassTenantAccessGate: pageInfo.bypassTenantAccessGate,
  };
  const authDecorator = authOnly
    ? AuthUser()
    : isModulePage
      ? AuthOwnerOnly()
      : AuthUserWithPermission(page.target, page.guardOptions);
  authDecorator(page.target.prototype, "user");
  if (isModulePage && !authOnly) logModuleRouteGated(pageInfo.fullSlug);
  if (authOnly) return;
  TenantScopedModel(RoleModel)(page.target.prototype, "roleModel");
  TenantScopedModel(TenantMemberModel)(page.target.prototype, "memberModel");
  RequestTenantIdProperty()(page.target.prototype, "tenantId");
}
