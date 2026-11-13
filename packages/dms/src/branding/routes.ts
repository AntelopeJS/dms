import {
  Context,
  Controller,
  Get,
  JSONBody,
  Post,
  Put,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { IfAuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import {
  CreateThemeLayer,
  GetTheme,
  SetTheme,
} from "@antelopejs/interface-dms-builder";
import { isPlatformOwner } from "../implementations/dms/page";
import { saveThemeBodySchema } from "./theme-schemas";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const ERROR_UNAUTHENTICATED = "Authentication required";
const ERROR_UNAUTHORIZED = "error.unauthorized";

/** Eight logos of 512 KiB in base64 come to about 5.3 MiB; the rest is the draft. */
const SAVE_BODY_LIMIT = 7 * 1024 * 1024;

interface OwnerCheck {
  requestContext: RequestContext;
  roleModel: RoleModel;
  memberModel: TenantMemberModel;
  user: User | undefined;
}

async function assertOwner(request: OwnerCheck): Promise<void> {
  assert(request.user, HTTP_UNAUTHORIZED, ERROR_UNAUTHENTICATED);
  const isOwner = await isPlatformOwner(
    request.user,
    request.memberModel,
    request.roleModel,
    getRequestTenantId(request.requestContext),
  );
  assert(isOwner, HTTP_FORBIDDEN, ERROR_UNAUTHORIZED);
}

/**
 * Registers `/api/branding`: the project's theme, read and written through the
 * builder's theme operations. Platform owners only. A refusal of the builder
 * (`stale`, `not_found`, `unsupported`, `invalid_config`) is an answer, `ok:
 * false` in a 200, for the editor to show.
 */
export function registerBrandingRoutes() {
  class BrandingController extends Controller("/api/branding") {
    @Context()
    declare requestContext: RequestContext;

    @TenantScopedModel(RoleModel)
    declare roleModel: RoleModel;

    @TenantScopedModel(TenantMemberModel)
    declare memberModel: TenantMemberModel;

    @IfAuthUser()
    declare user: User | undefined;

    @Get("theme")
    async readTheme() {
      await assertOwner(this);
      return GetTheme();
    }

    @Put("theme")
    async saveTheme(@JSONBody(SAVE_BODY_LIMIT) body: unknown) {
      await assertOwner(this);
      const { draft, expectedVersion } = assertValidation(body, (value) =>
        saveThemeBodySchema.parse(value),
      );
      return SetTheme(
        draft,
        expectedVersion === undefined ? undefined : { expectedVersion },
      );
    }

    @Post("theme/layer")
    async createLayer() {
      await assertOwner(this);
      return CreateThemeLayer();
    }
  }
  return BrandingController;
}
