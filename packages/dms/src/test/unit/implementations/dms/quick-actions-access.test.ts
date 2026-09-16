import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  buildSiteLayoutPayload,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as quickActionsImpl from "../../../../implementations/dms/quick-actions";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  PageController,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import {
  QuickAction,
  QuickActionCategory,
  internal as quickActionsInterface,
} from "@antelopejs/interface-dms/quick-actions";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  denyingTenantGate,
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const DENIED_TENANT = "qa-denied-tenant";
const ALLOWED_TENANT = "qa-allowed-tenant";
const RESTRICTED_PAGE_ID = "pages.qa-restricted";
const RECOVERY_PAGE_ID = "pages.qa-recovery";
const CATEGORY_ID = "qa-category";

const gateInfo = denyingTenantGate("qa-gate", DENIED_TENANT, "qa.suspended");

class PageQaOpen extends PageController("qa-open", {
  displayName: "Open",
  category: pagesCategory,
  publicAccess: true,
}) {}

class PageQaRestricted extends PageController("qa-restricted", {
  displayName: "Restricted",
  category: pagesCategory,
}) {}

class PageQaRecovery extends PageController("qa-recovery", {
  displayName: "Recovery",
  category: pagesCategory,
  bypassTenantAccessGate: true,
}) {}

async function actionsFor(
  grantedPermissions: string[],
  tenantId: string,
): Promise<Record<string, unknown>> {
  const { memberModel, roleModel } = stubPageAccessModels(grantedPermissions);
  const payload = await buildSiteLayoutPayload(
    { _id: "qa-member" } as User,
    memberModel,
    roleModel,
    tenantId,
  );
  return payload.quickActions.actions;
}

describe("[unit] implementations/dms/quick-actions — access follows the page", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    ImplementInterface(quickActionsInterface, quickActionsImpl.internal);

    cleanups.push(await registerTestPage(PageQaOpen));
    cleanups.push(await registerTestPage(PageQaRestricted));
    cleanups.push(await registerTestPage(PageQaRecovery));

    const category = QuickActionCategory(CATEGORY_ID, {
      displayName: "Quick actions",
    });
    for (const [id, page] of [
      ["qa-open", PageQaOpen],
      ["qa-restricted", PageQaRestricted],
      ["qa-recovery", PageQaRecovery],
    ] as const) {
      const info = QuickAction(id, {
        category,
        displayName: id,
        icon: "i-ph-lightning",
        target: { type: "navigate", page },
      });
      cleanups.push(() =>
        quickActionsInterface.RegisterQuickAction.unregister(info),
      );
    }
    cleanups.push(() =>
      quickActionsInterface.RegisterQuickActionCategory.unregister(category),
    );

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

  it("serves an action whose page the caller may reach", async () => {
    const actions = await actionsFor([RESTRICTED_PAGE_ID], ALLOWED_TENANT);

    expect(actions[`${CATEGORY_ID}:qa-restricted`]).to.not.equal(undefined);
  });

  it("leaves out an action whose page the caller may not reach", async () => {
    const actions = await actionsFor([], ALLOWED_TENANT);

    expect(actions).to.not.have.property(`${CATEGORY_ID}:qa-restricted`);
  });

  it("resolves the route from the page rather than a declared slug", async () => {
    const actions = await actionsFor([RESTRICTED_PAGE_ID], ALLOWED_TENANT);

    expect(actions[`${CATEGORY_ID}:qa-restricted`]).to.deep.include({
      target: { type: "navigate", to: "/qa-restricted", query: undefined },
    });
  });

  it("drops the product actions while the gate denies the tenant", async () => {
    const actions = await actionsFor([RESTRICTED_PAGE_ID], DENIED_TENANT);

    expect(actions).to.not.have.property(`${CATEGORY_ID}:qa-restricted`);
  });

  it("keeps the action of a page flagged bypassTenantAccessGate", async () => {
    const actions = await actionsFor([RECOVERY_PAGE_ID], DENIED_TENANT);

    expect(actions[`${CATEGORY_ID}:qa-recovery`]).to.not.equal(undefined);
  });

  it("keeps the action of a public page while the gate denies the tenant", async () => {
    const actions = await actionsFor([], DENIED_TENANT);

    expect(actions[`${CATEGORY_ID}:qa-open`]).to.not.equal(undefined);
  });

  it("omits a category whose actions all dropped", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([]);
    const payload = await buildSiteLayoutPayload(
      { _id: "qa-member" } as User,
      memberModel,
      roleModel,
      DENIED_TENANT,
    );

    // The public page's action survives, so the category has to stay too.
    expect(payload.quickActions.categories).to.have.property(CATEGORY_ID);
    expect(Object.keys(payload.quickActions.actions)).to.deep.equal([
      `${CATEGORY_ID}:qa-open`,
    ]);
  });
});

describe("[unit] implementations/dms/quick-actions — payload shape", () => {
  it("carries no access flag, since only reachable actions are sent", async () => {
    const payload = await quickActionsImpl.getQuickActionsForUser(async () => ({
      type: "event",
      name: "noop",
    }));

    for (const action of Object.values(payload.actions)) {
      expect(action).to.not.have.property("hasAccess");
    }
  });
});
