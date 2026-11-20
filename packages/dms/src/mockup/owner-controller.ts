import {
  Context,
  Controller,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { IfAuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { assertPlatformOwner } from "../implementations/dms/page";
import { MOCKUP_API } from "./fixtures";
import type { Who } from "./presence";

const HTTP_UNAUTHORIZED = 401;

/**
 * The parent of every `/api/mockup` controller: it holds what
 * {@link assertPlatformOwner} reads, and each handler calls
 * {@link MockupOwnerController.assertOwner} before anything else.
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
    assert(user, HTTP_UNAUTHORIZED, "Authentication required");
    return { userId: user._id, name: user.name || user.email };
  }
}
