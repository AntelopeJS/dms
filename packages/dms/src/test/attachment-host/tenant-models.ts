import { Controller, Get, Post } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { RoleModel } from "@antelopejs/interface-dms/db";
import {
  AuthTenantMember,
  AuthTenantOwner,
} from "@antelopejs/interface-dms/guards";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";

/** A module route that reads a tenant table next to a tenant guard. */
export class TenantGuardedRolesController extends Controller(
  "/api/tenant-guarded-roles",
) {
  @TenantScopedModel(RoleModel)
  declare roleModel: RoleModel;

  @AuthTenantMember()
  declare user: User;

  @Get("/names")
  async names(): Promise<string[]> {
    const roles = await this.roleModel.getAll();
    return roles.map((role) => role.name).sort();
  }
}

/** Module routes whose tenant guards pass the tenant access gate by, as a suspended workspace's recovery page does. */
export class TenantGateBypassController extends Controller(
  "/api/tenant-gate-bypass",
) {
  @Get("/member")
  member(
    @AuthTenantMember({ bypassTenantAccessGate: true }) user: User,
  ): string {
    return user._id;
  }

  @Post("/owner")
  owner(@AuthTenantOwner({ bypassTenantAccessGate: true }) user: User): string {
    return user._id;
  }
}
