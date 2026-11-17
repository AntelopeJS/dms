import {
  Context,
  Controller,
  Get,
  JSONBody,
  Post,
  Put,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assertValidation } from "@antelopejs/interface-api-util";
import { IfAuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import {
  CreateThemeLayer,
  GetTheme,
  SetTheme,
} from "@antelopejs/interface-dms-builder";
import { assertPlatformOwner } from "../implementations/dms/page";
import { saveThemeBodySchema } from "./theme-schemas";

/** Eight logos of 512 KiB in base64 come to about 5.3 MiB; the rest is the draft. */
const SAVE_BODY_LIMIT = 7 * 1024 * 1024;

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
      await assertPlatformOwner(this);
      return GetTheme();
    }

    @Put("theme")
    async saveTheme(@JSONBody(SAVE_BODY_LIMIT) body: unknown) {
      await assertPlatformOwner(this);
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
      await assertPlatformOwner(this);
      return CreateThemeLayer();
    }
  }
  return BrandingController;
}
