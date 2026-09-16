import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  buildSiteLayoutPayload,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as quickActionsImpl from "../../../../implementations/dms/quick-actions";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import type { ComponentBuilder } from "@antelopejs/interface-dms/component";
import {
  PageController,
  PageMetadata,
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
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import {
  denyingTenantGate,
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const DENIED_TENANT = "of-denied-tenant";
const CATEGORY_ID = "of-category";
const RECOVERY_PAGE_ID = "pages.of-recovery";
const RECOVERY_ADD_PERMISSION = `${RECOVERY_PAGE_ID}.invoices.add`;

const gateInfo = denyingTenantGate("of-gate", DENIED_TENANT, "of.suspended");

function formCapableComponent(name: string): ComponentBuilder<unknown> {
  const component = CustomComponent(name).meta({ name });
  component.action("add", { title: "Add" });
  return component as ComponentBuilder<unknown>;
}

// The recovery surface: reachable under a denying gate, and its form has to
// stay usable — that is the entire point of the opt-out.
class PageOfRecovery extends PageController("of-recovery", {
  displayName: "Recovery",
  category: pagesCategory,
  bypassTenantAccessGate: true,
}) {
  static invoices = formCapableComponent("OfInvoices");
}

class PageOfAmbiguous extends PageController("of-ambiguous", {
  displayName: "Ambiguous",
  category: pagesCategory,
}) {
  static first = formCapableComponent("OfFirst");
  static second = formCapableComponent("OfSecond");
}

class PageOfNested extends PageController("of-nested", {
  displayName: "Nested",
  category: pagesCategory,
}) {
  static content = CustomComponent("OfContent").child(
    "invoices",
    formCapableComponent("OfNestedInvoices"),
  );
}

async function actionsFor(
  grantedPermissions: string[],
  tenantId: string,
): Promise<Record<string, { target: { component?: string } }>> {
  const { memberModel, roleModel } = stubPageAccessModels(grantedPermissions);
  const payload = await buildSiteLayoutPayload(
    { _id: "of-member" } as User,
    memberModel,
    roleModel,
    tenantId,
  );
  return payload.quickActions.actions as Record<
    string,
    { target: { component?: string } }
  >;
}

async function registerPageWithComponents(
  page: typeof PageOfRecovery | typeof PageOfAmbiguous | typeof PageOfNested,
  components: Record<string, ComponentBuilder<unknown>>,
): Promise<() => void> {
  const meta = GetMetadata(page, PageMetadata);
  for (const [key, component] of Object.entries(components)) {
    meta.SetComponent(key, component);
  }
  return registerTestPage(page);
}

describe("[unit] implementations/dms/quick-actions — openForm targets", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    ImplementInterface(quickActionsInterface, quickActionsImpl.internal);

    cleanups.push(
      await registerPageWithComponents(PageOfRecovery, {
        invoices: PageOfRecovery.invoices,
      }),
    );
    cleanups.push(
      await registerPageWithComponents(PageOfAmbiguous, {
        first: PageOfAmbiguous.first,
        second: PageOfAmbiguous.second,
      }),
    );
    cleanups.push(
      await registerPageWithComponents(PageOfNested, {
        content: PageOfNested.content,
      }),
    );

    const category = QuickActionCategory(CATEGORY_ID, {
      displayName: "Open form",
    });
    const registered = [
      QuickAction("of-recovery", {
        category,
        displayName: "New invoice",
        icon: "i-ph-plus",
        target: { type: "openForm", page: PageOfRecovery },
      }),
      QuickAction("of-ambiguous", {
        category,
        displayName: "New something",
        icon: "i-ph-plus",
        target: { type: "openForm", page: PageOfAmbiguous },
      }),
      QuickAction("of-named", {
        category,
        displayName: "New second",
        icon: "i-ph-plus",
        target: {
          type: "openForm",
          page: PageOfAmbiguous,
          component: PageOfAmbiguous.second,
        },
      }),
      QuickAction("of-nested", {
        category,
        displayName: "New nested invoice",
        icon: "i-ph-plus",
        target: {
          type: "openForm",
          page: PageOfNested,
          component: PageOfNested.content.targetChild("invoices"),
        },
      }),
    ];
    for (const info of registered) {
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

  // Reading the add permission from the emptied gated set would drop the form
  // of the very page the gate opt-out exists to keep usable.
  it("keeps a recovery page's form while the gate denies the tenant", async () => {
    const actions = await actionsFor(
      [RECOVERY_PAGE_ID, RECOVERY_ADD_PERMISSION],
      DENIED_TENANT,
    );

    expect(actions[`${CATEGORY_ID}:of-recovery`]?.target.component).to.equal(
      "invoices",
    );
  });

  it("still requires the component's add permission on a recovery page", async () => {
    const actions = await actionsFor([RECOVERY_PAGE_ID], DENIED_TENANT);

    expect(actions).to.not.have.property(`${CATEGORY_ID}:of-recovery`);
  });

  // Unnamed, every table view of the page would open a form at once.
  it("refuses to serve an unnamed target on a page with several forms", async () => {
    const actions = await actionsFor(
      [
        "pages.of-ambiguous.first.add",
        "pages.of-ambiguous.second.add",
        "pages.of-ambiguous",
      ],
      "of-allowed-tenant",
    );

    expect(actions).to.not.have.property(`${CATEGORY_ID}:of-ambiguous`);
  });

  it("serves the named one on that same page", async () => {
    const actions = await actionsFor(
      ["pages.of-ambiguous.second.add", "pages.of-ambiguous"],
      "of-allowed-tenant",
    );

    expect(actions[`${CATEGORY_ID}:of-named`]?.target.component).to.equal(
      "second",
    );
  });

  it("serves a targeted child with its frontend component id", async () => {
    const actions = await actionsFor(
      ["pages.of-nested", "pages.of-nested.content.invoices.add"],
      "of-allowed-tenant",
    );

    expect(actions[`${CATEGORY_ID}:of-nested`]?.target.component).to.equal(
      "content-child-invoices",
    );
  });
});
