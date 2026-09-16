import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  filterPermissionsForBypassedSurfaces,
  resolveUserPermissions,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  PageController,
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

const DENIED_TENANT = "perm-denied-tenant";
const ALLOWED_TENANT = "perm-allowed-tenant";
const RECOVERY_FULL_ID = "pages.perm-recovery";
const RECOVERY_COMPONENT_ID = `${RECOVERY_FULL_ID}.settleButton`;
const PRODUCT_FULL_ID = "pages.perm-product";
const SHARED_PERMISSION_ID = "perm-shared";

const gateInfo = denyingTenantGate("perm-gate", DENIED_TENANT);

async function resolveFor(
  grantedPermissions: string[],
  tenantId: string,
  user: User = { _id: "perm-member" } as User,
): Promise<string[]> {
  const { memberModel, roleModel } = stubPageAccessModels(grantedPermissions);
  return resolveUserPermissions(user, memberModel, roleModel, tenantId);
}

describe("[unit] implementations/dms/page — permission filter under a gate", () => {
  const RECOVERY = "pages.recovery";
  const GATED = "pages.gated";

  it("answers nothing when no surface carries the flag", () => {
    const surfaces = new Map([
      [RECOVERY, false],
      [GATED, false],
    ]);
    expect([
      ...filterPermissionsForBypassedSurfaces(
        new Set([RECOVERY, "*"]),
        surfaces,
      ),
    ]).to.deep.equal([]);
  });

  it("keeps the wildcard only when a surface carries the flag", () => {
    const surfaces = new Map([[RECOVERY, true]]);
    expect([
      ...filterPermissionsForBypassedSurfaces(new Set(["*"]), surfaces),
    ]).to.deep.equal(["*"]);
  });

  it("keeps the descendants of a flagged surface and drops the others", () => {
    const surfaces = new Map([
      [RECOVERY, true],
      [GATED, false],
    ]);
    const kept = filterPermissionsForBypassedSurfaces(
      new Set([RECOVERY, `${RECOVERY}.table.export`, GATED, `${GATED}.table`]),
      surfaces,
    );
    expect([...kept].sort()).to.deep.equal(
      [RECOVERY, `${RECOVERY}.table.export`].sort(),
    );
  });

  it("lets the nearest declared surface decide inside a shared namespace", () => {
    const surfaces = new Map([
      [RECOVERY, true],
      [`${RECOVERY}.nested`, false],
    ]);
    const kept = filterPermissionsForBypassedSurfaces(
      new Set([`${RECOVERY}.form`, `${RECOVERY}.nested.form`]),
      surfaces,
    );
    expect([...kept]).to.deep.equal([`${RECOVERY}.form`]);
  });
});

describe("[unit] implementations/dms/page — permissions under a tenant gate", () => {
  const suiteCleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    suiteCleanups.push(
      await registerTestPage(
        PageController("perm-recovery", {
          displayName: "Recovery",
          category: pagesCategory,
          bypassTenantAccessGate: true,
        }),
      ),
    );
    suiteCleanups.push(
      await registerTestPage(
        PageController("perm-product", {
          displayName: "Product",
          category: pagesCategory,
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

  it("keeps the permissions of the surfaces that stay reachable", async () => {
    const granted = await resolveFor(
      [RECOVERY_FULL_ID, RECOVERY_COMPONENT_ID, PRODUCT_FULL_ID],
      DENIED_TENANT,
    );
    expect(granted.sort()).to.deep.equal(
      [RECOVERY_FULL_ID, RECOVERY_COMPONENT_ID].sort(),
    );
  });

  it("drops the permissions of every gated surface", async () => {
    expect(await resolveFor([PRODUCT_FULL_ID], DENIED_TENANT)).to.deep.equal(
      [],
    );
  });

  it("keeps the owner wildcard so the recovery page stays usable", async () => {
    const owner = { _id: "perm-owner", owner: true } as User;
    expect(await resolveFor([], DENIED_TENANT, owner)).to.deep.equal(["*"]);
  });

  it("keeps a shared permission namespace out when a gated page declares it too", async () => {
    const cleanups: Array<() => void> = [];
    cleanups.push(
      await registerTestPage(
        PageController("perm-shared-open", {
          displayName: "Shared, reachable",
          category: pagesCategory,
          permission: { id: SHARED_PERMISSION_ID },
          bypassTenantAccessGate: true,
        }),
      ),
    );
    cleanups.push(
      await registerTestPage(
        PageController("perm-shared-gated", {
          displayName: "Shared, gated",
          category: pagesCategory,
          permission: { id: SHARED_PERMISSION_ID },
        }),
      ),
    );

    try {
      expect(
        await resolveFor(
          [SHARED_PERMISSION_ID, `${SHARED_PERMISSION_ID}.table`],
          DENIED_TENANT,
        ),
      ).to.deep.equal([]);
    } finally {
      for (const cleanup of cleanups) cleanup();
    }
  });

  it("returns the whole set when no gate denies the tenant", async () => {
    const granted = await resolveFor(
      [RECOVERY_FULL_ID, PRODUCT_FULL_ID],
      ALLOWED_TENANT,
    );
    expect(granted.sort()).to.deep.equal(
      [RECOVERY_FULL_ID, PRODUCT_FULL_ID].sort(),
    );
  });

  it("returns nothing for an unauthenticated caller", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([PRODUCT_FULL_ID]);
    expect(
      await resolveUserPermissions(
        undefined,
        memberModel,
        roleModel,
        ALLOWED_TENANT,
      ),
    ).to.deep.equal([]);
  });
});
