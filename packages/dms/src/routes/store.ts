import {
  Context,
  Controller,
  Get,
  JSONBody,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { IfAuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { isPlatformOwner } from "../implementations/dms/page";
import { buildStoreListing } from "../store/listing";
import { startStoreOperation } from "../store/operations";
import type { StoreListing, StoreOperationKind } from "../store/types";
import {
  storeInstallSchema,
  storeOperationSchema,
} from "../validation/store.schema";

const HTTP_FORBIDDEN = 403;
const ERROR_UNAUTHORIZED = "error.unauthorized";

/**
 * The module store, platform owners only: the listing, and one route per
 * operation. An operation answers once accepted, with the listing showing it
 * running; the page follows it by reading the listing again.
 */
export class ModuleStoreController extends Controller("/dms/store") {
  @Context()
  declare requestContext: RequestContext;

  @TenantScopedModel(RoleModel)
  declare roleModel: RoleModel;

  @TenantScopedModel(TenantMemberModel)
  declare memberModel: TenantMemberModel;

  @IfAuthUser()
  declare user: User | undefined;

  private async assertOwner(): Promise<void> {
    const isOwner = await isPlatformOwner(
      this.user,
      this.memberModel,
      this.roleModel,
      getRequestTenantId(this.requestContext),
    );
    assert(isOwner, HTTP_FORBIDDEN, ERROR_UNAUTHORIZED);
  }

  private async run(
    kind: StoreOperationKind,
    body: Parameters<typeof storeOperationSchema.parse>[0],
  ): Promise<StoreListing> {
    await this.assertOwner();
    const { id } = assertValidation(body, (value) =>
      storeOperationSchema.parse(value),
    );
    await startStoreOperation(kind, id);
    return buildStoreListing();
  }

  @Get("/listing")
  async listing(): Promise<StoreListing> {
    await this.assertOwner();
    return buildStoreListing();
  }

  @Post("/install")
  async install(
    @JSONBody() body: Parameters<typeof storeInstallSchema.parse>[0],
  ): Promise<StoreListing> {
    await this.assertOwner();
    const { id, dependencies } = assertValidation(body, (value) =>
      storeInstallSchema.parse(value),
    );
    await startStoreOperation("install", id, { dependencies });
    return buildStoreListing();
  }

  @Post("/update")
  update(
    @JSONBody() body: Parameters<typeof storeOperationSchema.parse>[0],
  ): Promise<StoreListing> {
    return this.run("update", body);
  }

  @Post("/enable")
  enable(
    @JSONBody() body: Parameters<typeof storeOperationSchema.parse>[0],
  ): Promise<StoreListing> {
    return this.run("enable", body);
  }

  @Post("/disable")
  disable(
    @JSONBody() body: Parameters<typeof storeOperationSchema.parse>[0],
  ): Promise<StoreListing> {
    return this.run("disable", body);
  }

  @Post("/uninstall")
  uninstall(
    @JSONBody() body: Parameters<typeof storeOperationSchema.parse>[0],
  ): Promise<StoreListing> {
    return this.run("uninstall", body);
  }

  @Post("/apply")
  apply(
    @JSONBody() body: Parameters<typeof storeOperationSchema.parse>[0],
  ): Promise<StoreListing> {
    return this.run("apply", body);
  }
}
