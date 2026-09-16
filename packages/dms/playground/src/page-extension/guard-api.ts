import { Controller, Get } from "@antelopejs/interface-api";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { nestedTasksPermissionId, nestedTasksTarget } from "./target-page";

export class NestedTargetGuardAPI extends Controller(
  "/playground/nested-target",
) {
  @Get("permission")
  permission(@AuthUserWithPermission(nestedTasksTarget) _user: User): string {
    return nestedTasksPermissionId;
  }
}
