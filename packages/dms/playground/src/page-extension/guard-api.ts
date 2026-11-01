import { Controller, Get } from "@antelopejs/interface-api";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  NESTED_TARGET_API,
  nestedTasksPermissionId,
  nestedTasksTarget,
} from "./target-page";

interface GuardResponse {
  items: KeyValueListItem[];
}

export class NestedTargetGuardAPI extends Controller(NESTED_TARGET_API) {
  @Get("permission")
  permission(
    @AuthUserWithPermission(nestedTasksTarget) _user: User,
  ): GuardResponse {
    return {
      items: [
        {
          label: "Required permission",
          value: nestedTasksPermissionId,
          type: "mono",
          detail: 'GetPermissionId(Page.content.targetChild("tasks"))',
        },
        { label: "You hold it", value: "Yes", type: "status", tone: "success" },
      ],
    };
  }
}
