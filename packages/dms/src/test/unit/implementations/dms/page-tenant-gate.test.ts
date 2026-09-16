import { HTTPResult } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  buildPagePayload,
  internal as pageImplInternal,
  userCanAccessPage,
  buildSiteLayoutPayload,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
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
  registerTestCategory,
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const DENIED_TENANT = "gate-denied-tenant";
const ALLOWED_TENANT = "gate-allowed-tenant";
const SUSPENDED_CODE = "gate.suspended";
const BILLING_PAGE_SLUG = "/gate-billing";
const BILLING_FULL_ID = "pages.gate-billing";
const PRODUCT_FULL_ID = "pages.gate-product";
const RECOVERY_CATEGORY_ID = "gate-recovery";
const RECOVERY_CHILD_FULL_ID = `pages.${RECOVERY_CATEGORY_ID}.gate-recovery-child`;

const gateInfo = denyingTenantGate("gate-test", DENIED_TENANT, SUSPENDED_CODE);

async function pageAccess(
  fullSlug: string,
  grantedPermissions: string[],
  tenantId: string,
): Promise<boolean | undefined> {
  const { memberModel, roleModel } = stubPageAccessModels(grantedPermissions);
  const member = { _id: "gate-member" } as User;
  const payload = await buildSiteLayoutPayload(
    member,
    memberModel,
    roleModel,
    tenantId,
  );
  return payload.siteLayout.pages[fullSlug]?.hasAccess;
}

describe("[unit] implementations/dms/page — page-level bypassTenantAccessGate", () => {
  const suiteCleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    suiteCleanups.push(
      await registerTestPage(
        PageController("gate-billing", {
          displayName: "Billing",
          category: pagesCategory,
          bypassTenantAccessGate: true,
        }),
      ),
    );

    suiteCleanups.push(
      await registerTestPage(
        PageController("gate-product", {
          displayName: "Product",
          category: pagesCategory,
        }),
      ),
    );

    suiteCleanups.push(
      await registerTestPage(
        PageController("gate-granted", {
          displayName: "Granted by default",
          category: pagesCategory,
          permission: { defaultGranted: true },
        }),
      ),
    );

    suiteCleanups.push(
      await registerTestPage(
        PageController("gate-public", {
          displayName: "Public",
          category: pagesCategory,
          publicAccess: true,
        }),
      ),
    );

    const recovery = registerTestCategory(RECOVERY_CATEGORY_ID, {
      displayName: "Recovery",
      category: pagesCategory,
      bypassTenantAccessGate: true,
    });
    suiteCleanups.push(recovery.cleanup);
    suiteCleanups.push(
      await registerTestPage(
        PageController("gate-recovery-child", {
          displayName: "Recovery child",
          category: recovery.category,
        }),
      ),
    );

    tenantAccessInterface.RegisterTenantAccessGate(gateInfo);
  });

  after(() => {
    tenantAccessInterface.internal.RegisterTenantAccessGate.unregister(
      gateInfo,
    );
    for (const cleanup of suiteCleanups.splice(0)) {
      cleanup();
    }
  });

  it("keeps a flagged page visible while the gate denies the tenant", async () => {
    expect(
      await pageAccess(BILLING_PAGE_SLUG, [BILLING_FULL_ID], DENIED_TENANT),
    ).to.equal(true);
  });

  it("still requires the page permission on a flagged page", async () => {
    expect(await pageAccess(BILLING_PAGE_SLUG, [], DENIED_TENANT)).to.equal(
      false,
    );
  });

  it("hides an unflagged page while the gate denies the tenant", async () => {
    expect(
      await pageAccess("/gate-product", [PRODUCT_FULL_ID], DENIED_TENANT),
    ).to.equal(false);
  });

  for (const includeShared of [true, false]) {
    it(`rejects a gated page payload with shared=${includeShared}`, async () => {
      const { memberModel, roleModel } = stubPageAccessModels([
        PRODUCT_FULL_ID,
      ]);
      const result = await buildPagePayload(
        "/gate-product",
        { _id: "gate-member" } as User,
        memberModel,
        roleModel,
        DENIED_TENANT,
        includeShared,
      ).catch((error: unknown) => error);

      expect(result).to.deep.equal(new HTTPResult(403, SUSPENDED_CODE));
    });

    it(`preserves permission checks on recovery pages with shared=${includeShared}`, async () => {
      for (const permissions of [[], [BILLING_FULL_ID]]) {
        const { memberModel, roleModel } = stubPageAccessModels(permissions);
        const payload = await buildPagePayload(
          BILLING_PAGE_SLUG,
          { _id: "gate-member" } as User,
          memberModel,
          roleModel,
          DENIED_TENANT,
          includeShared,
        );
        expect(payload.route.hasAccess).to.equal(permissions.length > 0);
        expect(payload.route.displayName).to.equal(
          permissions.length ? "Billing" : "",
        );
      }
    });
  }

  it("inherits the flag from the page's category", async () => {
    expect(
      await pageAccess(
        `/${RECOVERY_CATEGORY_ID}/gate-recovery-child`,
        [RECOVERY_CHILD_FULL_ID],
        DENIED_TENANT,
      ),
    ).to.equal(true);
  });

  it("leaves an allowed tenant untouched", async () => {
    expect(
      await pageAccess("/gate-product", [PRODUCT_FULL_ID], ALLOWED_TENANT),
    ).to.equal(true);
  });

  it("drops the defaultGranted fallback while the gate denies the tenant", async () => {
    expect(await pageAccess("/gate-granted", [], DENIED_TENANT)).to.equal(
      false,
    );
  });

  it("keeps the defaultGranted fallback for an allowed tenant", async () => {
    expect(await pageAccess("/gate-granted", [], ALLOWED_TENANT)).to.equal(
      true,
    );
  });

  it("keeps a public page visible while the gate denies the tenant", async () => {
    expect(await pageAccess("/gate-public", [], DENIED_TENANT)).to.equal(true);
  });

  it("keeps the owner flag gated so owner-only surfaces stay closed", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([]);
    const owner = { _id: "gate-owner", owner: true } as User;
    const payload = await buildSiteLayoutPayload(
      owner,
      memberModel,
      roleModel,
      DENIED_TENANT,
    );
    expect(payload.isOwner).to.equal(false);
    expect(payload.siteLayout.pages[BILLING_PAGE_SLUG]?.hasAccess).to.equal(
      true,
    );
  });

  // The layout route is the third surface the flag has to reach, and the only
  // one no other test exercises: `Register()` derives the guard options from the
  // page, and a refactor that rebuilds that call site silently drops them.
  it("hands the page's gate bypass to its layout route guard", async () => {
    const flagged = PageController("gate-guarded", {
      displayName: "Guarded recovery",
      category: pagesCategory,
      bypassTenantAccessGate: true,
    });
    const flaggedMeta = GetMetadata(flagged, PageMetadata);
    await flaggedMeta.Register();

    const plain = PageController("gate-unguarded", {
      displayName: "Plain product page",
      category: pagesCategory,
    });
    const plainMeta = GetMetadata(plain, PageMetadata);
    await plainMeta.Register();

    try {
      expect(flaggedMeta.guardOptions?.bypassTenantAccessGate).to.equal(true);
      expect(plainMeta.guardOptions?.bypassTenantAccessGate).to.equal(
        undefined,
      );
    } finally {
      if (flaggedMeta.pageInfo) {
        pageInterfaceInternal.RegisterPage.unregister(flaggedMeta.pageInfo);
      }
      if (plainMeta.pageInfo) {
        pageInterfaceInternal.RegisterPage.unregister(plainMeta.pageInfo);
      }
    }
  });

  it("mirrors the flag in userCanAccessPage", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([BILLING_FULL_ID]);
    const member = { _id: "gate-member" } as User;
    expect(
      await userCanAccessPage(
        member,
        BILLING_FULL_ID,
        memberModel,
        roleModel,
        DENIED_TENANT,
      ),
    ).to.equal(true);
    expect(
      await userCanAccessPage(
        member,
        PRODUCT_FULL_ID,
        memberModel,
        roleModel,
        DENIED_TENANT,
      ),
    ).to.equal(false);
  });
});
