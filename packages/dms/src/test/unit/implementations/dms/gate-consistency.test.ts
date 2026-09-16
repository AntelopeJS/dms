import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  userCanAccessPage,
  buildSiteLayoutPayload,
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
import { gateAllowsSurface } from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  denyingTenantGate,
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const DENIED_TENANT = "gc-denied-tenant";
const MEMBER = { _id: "gc-member" } as User;
const gateInfo = denyingTenantGate("gc-gate", DENIED_TENANT, "gc.suspended");

const SURFACES = [
  {
    id: "gc-public",
    options: { publicAccess: true },
    fullId: "pages.gc-public",
  },
  { id: "gc-auth", options: { authOnly: true }, fullId: "pages.gc-auth" },
  {
    id: "gc-bypass",
    options: { bypassTenantAccessGate: true },
    fullId: "pages.gc-bypass",
  },
  { id: "gc-product", options: {}, fullId: "pages.gc-product" },
] as const;

describe("[unit] dms — the access paths agree under a denying gate", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    for (const surface of SURFACES) {
      cleanups.push(
        await registerTestPage(
          PageController(surface.id, {
            displayName: surface.id,
            category: pagesCategory,
            ...surface.options,
          }),
        ),
      );
    }
    tenantAccessInterface.RegisterTenantAccessGate(gateInfo);
  });

  after(() => {
    tenantAccessInterface.internal.RegisterTenantAccessGate.unregister(
      gateInfo,
    );
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  // The menu and realtime page access read the same rule; a surface visible in
  // one and refused by the other is the divergence this suite exists to catch.
  for (const surface of SURFACES) {
    const expected = gateAllowsSurface(surface.options, true);

    it(`agrees on "${surface.id}" (${expected ? "reachable" : "refused"})`, async () => {
      const { memberModel, roleModel } = stubPageAccessModels([surface.fullId]);
      const payload = await buildSiteLayoutPayload(
        MEMBER,
        memberModel,
        roleModel,
        DENIED_TENANT,
      );
      const menuAccess = payload.siteLayout.pages[`/${surface.id}`]?.hasAccess;

      const realtimeAccess = await userCanAccessPage(
        MEMBER,
        surface.fullId,
        memberModel,
        roleModel,
        DENIED_TENANT,
      );

      expect(menuAccess).to.equal(expected);
      expect(realtimeAccess).to.equal(expected);
    });
  }
});

describe("[unit] interfaces/dms/tenant-access — gateAllowsSurface", () => {
  it("lets everything through when no gate denies", () => {
    expect(gateAllowsSurface({}, false)).to.equal(true);
  });

  it("keeps the surfaces that opted out or drop permissions by design", () => {
    expect(gateAllowsSurface({ bypassTenantAccessGate: true }, true)).to.equal(
      true,
    );
    expect(gateAllowsSurface({ publicAccess: true }, true)).to.equal(true);
    expect(gateAllowsSurface({ authOnly: true }, true)).to.equal(true);
  });

  it("shuts an ordinary product surface out", () => {
    expect(gateAllowsSurface({}, true)).to.equal(false);
  });
});
