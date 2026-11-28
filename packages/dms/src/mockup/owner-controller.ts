import {
  Context,
  Controller,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { IfAuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { HasPermission } from "@antelopejs/interface-dms/permissions";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import {
  assertPlatformOwner,
  buildAccessContext,
} from "../implementations/dms/page";
import { MOCKUP_API } from "./fixtures";
import type { Who } from "./presence";
import {
  MOCKUP_REVIEW_PERMISSION_ID,
  type MockupReviewer,
  type MockupRole,
} from "./review";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const ERROR_UNAUTHENTICATED = "Authentication required";
const ERROR_UNAUTHORIZED = "error.unauthorized";

/** What a controller holds to tell the role of its caller. */
interface RoleCheck {
  requestContext: RequestContext;
  roleModel: RoleModel;
  memberModel: TenantMemberModel;
}

/**
 * The role of `user` on the mockups: the platform owner's, or a reviewer's
 * when a role of theirs holds {@link MOCKUP_REVIEW_PERMISSION_ID} and the
 * tenant gate lets them in; undefined for anyone else.
 */
async function roleOf(
  check: RoleCheck,
  user: User,
): Promise<MockupRole | undefined> {
  const { gated } = await buildAccessContext(
    user,
    check.memberModel,
    check.roleModel,
    getRequestTenantId(check.requestContext),
  );
  if (gated.isOwner) return "owner";
  const reviews = await HasPermission(
    gated.permissions,
    MOCKUP_REVIEW_PERMISSION_ID,
  );
  return reviews ? "reviewer" : undefined;
}

/**
 * The parent of every `/api/mockup` controller: it holds what
 * {@link assertPlatformOwner} reads, and each handler calls
 * {@link MockupOwnerController.assertOwner} or
 * {@link MockupOwnerController.reviewer} before anything else.
 */
export class MockupOwnerController extends Controller(MOCKUP_API) {
  @Context()
  declare requestContext: RequestContext;

  @TenantScopedModel(RoleModel)
  declare roleModel: RoleModel;

  @TenantScopedModel(TenantMemberModel)
  declare memberModel: TenantMemberModel;

  @IfAuthUser()
  declare user: User | undefined;

  /** Refuses a caller who is not the platform owner: 401 signed out, 403 otherwise. */
  assertOwner(): Promise<void> {
    return assertPlatformOwner(this);
  }

  /** The platform owner calling, once {@link assertOwner} accepted them: the user a viewer of a mockup is, and the name the other viewers see. */
  async owner(): Promise<Who> {
    await this.assertOwner();
    const { user } = this;
    assert(user, HTTP_UNAUTHORIZED, ERROR_UNAUTHENTICATED);
    return { userId: user._id, name: user.name || user.email };
  }

  /**
   * Refuses a caller who neither is the platform owner nor holds the review
   * permission: 401 signed out, 403 otherwise. Answers who calls, and as
   * what, for the routes a reviewer reaches.
   */
  async reviewer(): Promise<MockupReviewer> {
    const { user } = this;
    assert(user, HTTP_UNAUTHORIZED, ERROR_UNAUTHENTICATED);
    const role = await roleOf(this, user);
    assert(role, HTTP_FORBIDDEN, ERROR_UNAUTHORIZED);
    return { userId: user._id, name: user.name || user.email, role };
  }

  /** {@link reviewer}, for a route that needs only the refusal. */
  async assertReviewer(): Promise<void> {
    await this.reviewer();
  }
}
