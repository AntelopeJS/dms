import {
  Controller,
  Parameter,
  Get,
  Context,
  type RequestContext,
  Post,
  JSONBody,
} from "@antelopejs/interface-api";
import {
  BOOTSTRAP_HEADER,
  type FrontendManifest,
  type ManifestModuleEntry,
  buildFrontendManifest,
  acknowledgeFrontendReady,
} from "../../../store/frontend";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { IfAuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { assert } from "@antelopejs/interface-api-util";
import {
  type ModuleCatalogContext,
  GetPageLayoutBySlug,
} from "@antelopejs/interface-dms/page";
import { assertPageSessionAccepted } from "../stale-session";
import { resolveUserPermissions, buildAccessContext } from "./access";
import type {
  SiteLayoutPayload,
  ModuleCatalogEntry,
  PageResponsePayload,
} from "./types";
import {
  buildSiteLayoutPayload,
  PAGE_LAYOUT_SLUG_PARAMETER,
  pageQueryOf,
  buildPagePayload,
} from "./payloads";
import { HTTP_FORBIDDEN, ERROR_UNAUTHORIZED, moduleRegistry } from "./state";
import {
  runModuleStatusHook,
  runModuleReadoutHook,
  presentModuleInfo,
  computeModuleAccess,
  resolveModuleLandingSlug,
} from "./module-catalog";

export const OMIT_SHARED_PAGE_QUERY_VALUE = "false";

export class DMSController extends Controller("/dms") {
  @Parameter(BOOTSTRAP_HEADER, "header")
  declare bootstrapHeader: string | undefined;

  @Parameter("path", "query")
  declare pagePath: string;

  @Parameter("shared", "query")
  declare sharedPage: string | undefined;

  @Parameter("authorization", "header")
  declare authorization: string | undefined;

  @Get("/frontend")
  async frontend(
    @Context() requestContext: RequestContext,
    @Parameter("clientUrl", "query") clientUrl: string | undefined,
    @Parameter("renderer", "query") renderer: string | undefined,
    @Parameter("rendererVersion", "query") rendererVersion: string | undefined,
  ): Promise<FrontendManifest<ManifestModuleEntry>> {
    return buildFrontendManifest(
      requestContext,
      clientUrl,
      renderer,
      rendererVersion,
      this.bootstrapHeader,
    );
  }

  @Post("/frontend/ready")
  frontendReady(
    @JSONBody() body: Parameters<typeof acknowledgeFrontendReady>[0],
  ): void {
    acknowledgeFrontendReady(body, this.bootstrapHeader);
  }

  @Get("/permissions")
  async userPermissions(
    @Context() requestContext: RequestContext,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @IfAuthUser() user: User | undefined,
  ): Promise<string[]> {
    return resolveUserPermissions(
      user,
      memberModel,
      roleModel,
      getRequestTenantId(requestContext),
    );
  }

  @Get("/sitelayout")
  async siteLayout(
    @Context() requestContext: RequestContext,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @IfAuthUser() user: User | undefined,
  ): Promise<SiteLayoutPayload> {
    return buildSiteLayoutPayload(
      user,
      memberModel,
      roleModel,
      getRequestTenantId(requestContext),
    );
  }

  @Get("/modules-listing")
  async modulesListing(
    @Context() requestContext: RequestContext,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @IfAuthUser() user: User | undefined,
  ): Promise<ModuleCatalogEntry[]> {
    const tenantId = getRequestTenantId(requestContext);
    const accessContext = await buildAccessContext(
      user,
      memberModel,
      roleModel,
      tenantId,
    );
    assert(accessContext.gated.isOwner, HTTP_FORBIDDEN, ERROR_UNAUTHORIZED);

    const catalogContext: ModuleCatalogContext = { user, tenantId };
    return Promise.all(
      Object.values(moduleRegistry).map(async (info) => {
        const [status, readout] = await Promise.all([
          runModuleStatusHook(info, catalogContext),
          runModuleReadoutHook(info, catalogContext),
        ]);
        return {
          ...presentModuleInfo(info),

          hasAccess: await computeModuleAccess(info.id, accessContext),
          landingSlug: resolveModuleLandingSlug(info),
          status,
          readout,
        };
      }),
    );
  }

  @Get("/pagelayout")
  async pageLayout(
    @Context() requestContext: RequestContext,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @IfAuthUser() user: User | undefined,
    @Parameter(PAGE_LAYOUT_SLUG_PARAMETER, "query") slug: string,
  ) {
    assert(slug, 400, "error.slug_required");

    const normalizedSlug = slug.startsWith("/") ? slug : `/${slug}`;
    const handler = GetPageLayoutBySlug(normalizedSlug);
    assert(handler, 404, "error.page_not_found");

    return handler({
      user,
      memberModel,
      roleModel,
      tenantId: getRequestTenantId(requestContext),
      query: pageQueryOf(requestContext),
    });
  }

  @Get("/page")
  async page(
    @Context() requestContext: RequestContext,
    @TenantScopedModel(RoleModel) roleModel: RoleModel,
    @TenantScopedModel(TenantMemberModel) memberModel: TenantMemberModel,
    @IfAuthUser() user: User | undefined,
  ): Promise<PageResponsePayload> {
    assert(this.pagePath, 400, "error.path_required");
    const payload = await buildPagePayload(
      this.pagePath,
      user,
      memberModel,
      roleModel,
      getRequestTenantId(requestContext),
      this.sharedPage !== OMIT_SHARED_PAGE_QUERY_VALUE,
      requestContext,
    );
    await assertPageSessionAccepted(payload, !!user, this.authorization);
    return payload;
  }
}
