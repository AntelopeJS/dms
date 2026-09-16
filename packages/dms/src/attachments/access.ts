import type { RequestContext } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { userCanAccessPage } from "../implementations/dms/page";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  GetEffectiveUserPermissions,
  HasPermission,
} from "@antelopejs/interface-dms/permissions";
import type { NativeUploadFieldRegistration } from "@antelopejs/interface-dms/uploads";
import {
  authenticateRequestPrincipal,
  type RequestPrincipal,
} from "@antelopejs/interface-dms/auth";
import type { UploadTokenClaims } from "../utils/upload-token";
import { denyAttachment } from "./registry";

interface RegistrationEntry {
  declaration: NativeUploadFieldRegistration;
  count: number;
}
const registrations = new Map<string, RegistrationEntry>();

export const RegisterNativeUploadField = {
  register(registration: NativeUploadFieldRegistration): void {
    const key = JSON.stringify(registration);
    const current = registrations.get(key);
    registrations.set(key, {
      declaration: JSON.parse(key),
      count: (current?.count || 0) + 1,
    });
  },
  unregister(registration: NativeUploadFieldRegistration): void {
    const key = JSON.stringify(registration);
    const current = registrations.get(key);
    if (current && current.count > 1) current.count -= 1;
    else registrations.delete(key);
  },
};

function declarationsMatch(
  declaration: NativeUploadFieldRegistration,
  claims: UploadTokenClaims,
  write: boolean,
): boolean {
  return (
    declaration.pageId === claims.pageId &&
    declaration.componentId === claims.componentId &&
    declaration.field === claims.field &&
    declaration.storage === claims.storage &&
    declaration.path === claims.path &&
    declaration.visibility === claims.visibility &&
    (!write || declaration.writePermission === claims.writePermission)
  );
}

async function hasComponentAccess(
  principal: RequestPrincipal,
  registration: NativeUploadFieldRegistration,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  write: boolean,
): Promise<boolean> {
  const member = await memberModel.getByUser(principal.user._id);
  if (!member) return false;
  const permissions = await GetEffectiveUserPermissions(
    principal.user,
    principal.tenantId,
    member.roleIds,
    roleModel,
  );
  const required = [...registration.readPermissions];
  if (write && registration.writePermission)
    required.push(registration.writePermission);
  return (
    await Promise.all(required.map((id) => HasPermission(permissions, id)))
  ).every(Boolean);
}

export async function assertNativeFileAccess(
  context: RequestContext,
  owner: UploadTokenClaims,
  write: boolean,
): Promise<RequestPrincipal> {
  if (!owner.pageId || !owner.componentId) denyAttachment();
  const registration = [...registrations.values()].find((item) =>
    declarationsMatch(item.declaration, owner, write),
  )?.declaration;
  if (!registration) denyAttachment();
  if (write && registration.writePermission === "__native_upload_disabled__")
    denyAttachment();
  const principal = await authenticateRequestPrincipal(context);
  const memberModel = GetModel(TenantMemberModel, principal.tenantId);
  const roleModel = GetModel(RoleModel, principal.tenantId);
  if (
    !(await userCanAccessPage(
      principal.user,
      registration.pageId,
      memberModel,
      roleModel,
      principal.tenantId,
    ))
  )
    denyAttachment();
  if (
    !(await hasComponentAccess(
      principal,
      registration,
      memberModel,
      roleModel,
      write,
    ))
  )
    denyAttachment();
  return principal;
}
