import type { ControllerClass } from "@antelopejs/interface-api";
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
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  denyingTenantGate,
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const DENIED_TENANT = "layout-gate-denied-tenant";
const ALLOWED_TENANT = "layout-gate-allowed-tenant";
const SUSPENDED_CODE = "layout-gate.suspended";
const HTTP_FORBIDDEN = 403;
const MEMBER = { _id: "layout-gate-member" } as User;

const gateInfo = denyingTenantGate(
  "layout-gate",
  DENIED_TENANT,
  SUSPENDED_CODE,
);

// The by-slug entry (`GET /dms/pagelayout`) only requires a session, so the
// resolver is what applies the gate there. The page's own route is guarded by
// its auth decorators instead — and `authOnly` pages never receive the
// tenant-scoped models at all, which is why they must stay exempt.
const models = stubPageAccessModels(["*"]);

async function loadLayout(slug: string, tenantId: string): Promise<unknown> {
  const handler = GetPageLayoutBySlug(slug);
  if (!handler) throw new Error(`no layout handler registered for ${slug}`);
  return handler(MEMBER, models.memberModel, models.roleModel, tenantId);
}

async function refusalOf(promise: Promise<unknown>): Promise<HTTPResult> {
  try {
    await promise;
  } catch (error) {
    expect(error).to.be.instanceOf(HTTPResult);
    return error as HTTPResult;
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

    const controllers: Record<string, ControllerClass> = {
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

  // The three exemptions: a recovery surface opts out explicitly, and
  // authOnly/publicAccess pages are the screens a denied tenant must still
  // reach — the auth pages and the suspended-workspace screen.
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
