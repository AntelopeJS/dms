import {
  Context,
  Controller,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { NotifyMenuChanged } from "@antelopejs/interface-dms/page";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { RegisterTenantAccessGate } from "@antelopejs/interface-dms/tenant-access";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";

export const GATE_DEMO_DENIED_CODE = "playground.gate_demo.suspended";

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

// The demo's recovery-path switch: deliberately not gated, it must stay
// reachable while the tenant is suspended to lift the suspension.
export class GateDemoController extends Controller("/playground/gate-demo") {
  @Post("/toggle")
  async toggle(
    @Context() requestContext: RequestContext,
    @AuthUser() _user: User,
  ): Promise<GateDemoToggleResult> {
    const tenantId = getRequestTenantId(requestContext);
    const suspended = !suspendedTenants.has(tenantId);
    if (suspended) {
      suspendedTenants.add(tenantId);
    } else {
      suspendedTenants.delete(tenantId);
    }
    void NotifyMenuChanged(tenantId);
    return { tenantId, suspended };
  }
}
