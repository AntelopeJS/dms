import {
  Context,
  Controller,
  Get,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base";
import { NotifyMenuChanged } from "@antelopejs/interface-dms/page";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import {
  CheckTenantAccess,
  RegisterTenantAccessGate,
} from "@antelopejs/interface-dms/tenant-access";
import {
  AuthTenantMember,
  AuthTenantOwner,
} from "@antelopejs/interface-dms/guards";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";

export const GATE_DEMO_DENIED_CODE = "playground.gate_demo.suspended";
export const GATE_DEMO_API = "/api/playground/gate-demo";

const suspendedTenants = new Set<string>();

RegisterTenantAccessGate({
  id: "playground-gate-demo",
  order: 0,
  gate: (_userId, tenantId) =>
    suspendedTenants.has(tenantId)
      ? { allowed: false, code: GATE_DEMO_DENIED_CODE }
      : { allowed: true },
});

interface GateDemoToggleResult {
  tenantId: string;
  suspended: boolean;
}

interface ItemsResponse {
  items: KeyValueListItem[];
}

// The demo's recovery-path switch: it bypasses the gate, so it stays
// reachable while the tenant is suspended to lift the suspension, and only
// the workspace owner may press it.
export class GateDemoController extends Controller(GATE_DEMO_API) {
  @Post("toggle")
  async toggle(
    @Context() requestContext: RequestContext,
    @AuthTenantOwner({ bypassTenantAccessGate: true }) _user: User,
  ): Promise<GateDemoToggleResult> {
    const tenantId = getRequestTenantId(requestContext);
    const suspended = !suspendedTenants.has(tenantId);
    if (suspended) {
      suspendedTenants.add(tenantId);
    } else {
      suspendedTenants.delete(tenantId);
    }
    fireAndForget(NotifyMenuChanged(tenantId), "menu change notification");
    return { tenantId, suspended };
  }

  /** What `CheckTenantAccess` answers for the caller, gate bypassed. */
  @Get("status")
  async status(
    @Context() requestContext: RequestContext,
    @AuthTenantMember({ bypassTenantAccessGate: true }) user: User,
  ): Promise<ItemsResponse> {
    const tenantId = getRequestTenantId(requestContext);
    const access = await CheckTenantAccess(user._id, tenantId);
    return {
      items: [
        { label: "Workspace", value: tenantId, type: "mono" },
        {
          label: "CheckTenantAccess",
          value: access.allowed ? "Allowed" : "Denied",
          type: "status",
          tone: access.allowed ? "success" : "error",
          detail: access.allowed ? undefined : access.code,
        },
      ],
    };
  }
}
