import { Controller, Get } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { RoleModel } from "@antelopejs/interface-dms/db";
import { AuthTenantMember } from "@antelopejs/interface-dms/guards";
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
