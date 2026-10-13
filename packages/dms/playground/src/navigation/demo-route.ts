import {
  Context,
  Controller,
  Get,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import type {
  BannerContent,
  KeyValueListItem,
} from "@antelopejs/interface-dms/base";
import { NotifyMenuChanged } from "@antelopejs/interface-dms/page";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { NAVIGATION_DEMO_API } from "./category";
import { rotateDemoProjectStatuses } from "./dynamic-provider";

interface RotateResult {
  statuses: string[];
}

interface ItemsResponse {
  items: KeyValueListItem[];
}

// What a module does after changing the data behind its menu: mutate, then tell
// the DMS. Every open session of the tenant re-fetches its site layout, so the
// status dots move without a reload.
export class NavigationDemoController extends Controller(NAVIGATION_DEMO_API) {
  @Post("rotate-status")
  async rotateStatus(
    @Context() requestContext: RequestContext,
    @AuthUser() _user: User,
  ): Promise<RotateResult> {
    const statuses = rotateDemoProjectStatuses();
    fireAndForget(
      NotifyMenuChanged(getRequestTenantId(requestContext)),
      "menu change notification",
    );
    return { statuses };
  }

  /** The banner the overview shows after a failed validation redirected. */
  @Get("redirected")
  redirected(
    @AuthUser() _user: User,
    @Parameter("missing", "query") missing: string | undefined,
  ): BannerContent {
    if (!missing) return {};
    return {
      tone: "warning",
      title: `Redirected here: no project is called "${missing}"`,
      description:
        "The project page's validation function refused the URL, and its redirectTo sent you to this page with ?missing= set.",
    };
  }

  /** What the path-parameter page reads, from its `{{params.projectId}}`. */
  @Get("projects/:projectId")
  project(
    @AuthUser() _user: User,
    @Parameter("projectId") projectId: string,
  ): ItemsResponse {
    return {
      items: [
        { label: "Route parameter", value: projectId, type: "mono" },
        {
          label: "Read through",
          value: `${NAVIGATION_DEMO_API}/projects/{{params.projectId}}`,
          type: "mono",
        },
      ],
    };
  }
}
