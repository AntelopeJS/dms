import {
  Context,
  Controller,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { NotifyMenuChanged } from "@antelopejs/interface-dms/page";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { rotateDemoProjectStatuses } from "./dynamic-provider";

interface RotateResult {
  statuses: string[];
}

// What a module does after changing the data behind its menu: mutate, then tell
// the DMS. Every open session of the tenant re-fetches its site layout, so the
// status dots move without a reload.
export class NavigationDemoController extends Controller(
  "/playground/navigation",
) {
  @Post("/rotate-status")
  async rotateStatus(
    @Context() requestContext: RequestContext,
    @AuthUser() _user: User,
  ): Promise<RotateResult> {
    const statuses = rotateDemoProjectStatuses();
    void NotifyMenuChanged(getRequestTenantId(requestContext));
    return { statuses };
  }
}
