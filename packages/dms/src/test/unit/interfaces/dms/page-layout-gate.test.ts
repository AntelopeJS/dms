import { HTTPResult } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import { internal as pageImplInternal } from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  GetPageLayoutBySlug,
  PageController,
  PageMetadata,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import {
  denyingTenantGate,
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";
import { userFixture } from "../../../helpers/user-fixture";

const DENIED_TENANT = "layout-gate-denied-tenant";
const ALLOWED_TENANT = "layout-gate-allowed-tenant";
const SUSPENDED_CODE = "layout-gate.suspended";
const HTTP_FORBIDDEN = 403;
const MEMBER = userFixture({ _id: "layout-gate-member" });

const gateInfo = denyingTenantGate(
  "layout-gate",
  DENIED_TENANT,
  SUSPENDED_CODE,
);

const models = stubPageAccessModels(["*"]);

async function loadLayout(slug: string, tenantId: string) {
  const handler = GetPageLayoutBySlug(slug);
  if (!handler) throw new Error(`no layout handler registered for ${slug}`);
  return handler({
    user: MEMBER,
    memberModel: models.memberModel,
    roleModel: models.roleModel,
    tenantId,
  });
}

async function refusalOf(promise: Promise<unknown>): Promise<HTTPResult> {
  try {
    await promise;
  } catch (error: PromiseRejectedResult["reason"]) {
    expect(error).to.be.instanceOf(HTTPResult);
    return error;
  }
  throw new Error("expected the layout resolution to refuse");
}

describe("[unit] interfaces/dms/page — layout fetched by slug under a tenant gate", () => {
  const suiteCleanups: Array<() => void> = [];
  const slugs: Record<string, string> = {};

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    const controllers = {
      product: PageController("lg-product", {
        displayName: "Product",
        category: pagesCategory,
      }),
      recovery: PageController("lg-recovery", {
        displayName: "Recovery",
        category: pagesCategory,
        bypassTenantAccessGate: true,
      }),
      authOnly: PageController("lg-authonly", {
        displayName: "Auth only",
        category: pagesCategory,
        authOnly: true,
      }),
      publicPage: PageController("lg-public", {
        displayName: "Public",
        category: pagesCategory,
        publicAccess: true,
      }),
    };

    for (const [name, controller] of Object.entries(controllers)) {
      suiteCleanups.push(await registerTestPage(controller));
      const { pageInfo } = GetMetadata(controller, PageMetadata);
      if (!pageInfo) throw new Error(`page ${name} was not registered`);
      slugs[name] = pageInfo.fullSlug;
    }

    tenantAccessInterface.RegisterTenantAccessGate(gateInfo);
  });

  after(() => {
    tenantAccessInterface.internal.RegisterTenantAccessGate.unregister(
      gateInfo,
    );
    for (const cleanup of suiteCleanups.splice(0)) cleanup();
  });

  it("refuses an ordinary page while the gate denies the tenant", async () => {
    const error = await refusalOf(loadLayout(slugs.product, DENIED_TENANT));
    expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
    expect(error.getBody()).to.equal(SUSPENDED_CODE);
  });

  it("serves an ordinary page while the gate allows the tenant", async () => {
    expect(await loadLayout(slugs.product, ALLOWED_TENANT)).to.not.equal(
      undefined,
    );
  });

  it("serves a page flagged bypassTenantAccessGate", async () => {
    expect(await loadLayout(slugs.recovery, DENIED_TENANT)).to.not.equal(
      undefined,
    );
  });

  it("serves an authOnly page", async () => {
    expect(await loadLayout(slugs.authOnly, DENIED_TENANT)).to.not.equal(
      undefined,
    );
  });

  it("serves a publicAccess page", async () => {
    expect(await loadLayout(slugs.publicPage, DENIED_TENANT)).to.not.equal(
      undefined,
    );
  });

  it("stops serving a page once it unregisters", async () => {
    const controller = PageController("lg-transient", {
      displayName: "Transient",
      category: pagesCategory,
    });
    const cleanup = await registerTestPage(controller);
    const slug = GetMetadata(controller, PageMetadata).pageInfo?.fullSlug ?? "";
    expect(GetPageLayoutBySlug(slug)).to.not.equal(undefined);

    cleanup();

    expect(GetPageLayoutBySlug(slug)).to.equal(undefined);
  });
});
