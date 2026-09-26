import type { ControllerClass } from "@antelopejs/interface-api";
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
import type {
  ButtonPermission,
  ComponentBuilder,
} from "@antelopejs/interface-dms/component";
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
  type QuickActionTarget,
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

const ALLOWED_TENANT = "qb-allowed-tenant";
const DENIED_TENANT = "qb-denied-tenant";
const CATEGORY_ID = "qb-category";
const INVITE_BUTTON = "invite";

const gateInfo = denyingTenantGate("qb-gate", DENIED_TENANT, "qb.suspended");

function componentWithButton(
  name: string,
  permission?: ButtonPermission,
): ComponentBuilder<unknown> {
  const component = CustomComponent(name).meta({ name });
  component.action("add", { title: "Add" });
  component.button(INVITE_BUTTON, { permission });
  return component as ComponentBuilder<unknown>;
}

class PageQbGated extends PageController("qb-gated", {
  displayName: "Gated button",
  category: pagesCategory,
}) {
  static table = componentWithButton("QbGatedTable", "add");
}

class PageQbOpen extends PageController("qb-open", {
  displayName: "Open button",
  category: pagesCategory,
}) {
  static table = componentWithButton("QbOpenTable");
}

class PageQbForeign extends PageController("qb-foreign", {
  displayName: "Foreign permission",
  category: pagesCategory,
}) {
  static table = componentWithButton(
    "QbForeignTable",
    PageQbGated.table.getAction("add"),
  );
}

class PageQbAmbiguous extends PageController("qb-ambiguous", {
  displayName: "Ambiguous button",
  category: pagesCategory,
}) {
  static first = componentWithButton("QbFirst");
  static second = componentWithButton("QbSecond");
}

class PageQbRecovery extends PageController("qb-recovery", {
  displayName: "Recovery",
  category: pagesCategory,
  bypassTenantAccessGate: true,
}) {
  static table = componentWithButton("QbRecoveryTable", "add");
}

const TARGETS: Record<string, QuickActionTarget> = {
  "qb-gated": { type: "button", page: PageQbGated, button: INVITE_BUTTON },
  "qb-open": { type: "button", page: PageQbOpen, button: INVITE_BUTTON },
  "qb-foreign": { type: "button", page: PageQbForeign, button: INVITE_BUTTON },
  "qb-unknown": { type: "button", page: PageQbOpen, button: "no-such-button" },
  "qb-ambiguous": {
    type: "button",
    page: PageQbAmbiguous,
    button: INVITE_BUTTON,
  },
  "qb-named": {
    type: "button",
    page: PageQbAmbiguous,
    button: INVITE_BUTTON,
    component: PageQbAmbiguous.second,
  },
  "qb-recovery": {
    type: "button",
    page: PageQbRecovery,
    button: INVITE_BUTTON,
  },
};

type QuickActionTargetPayload = Record<string, { target: unknown }>;

async function actionsFor(
  grantedPermissions: string[],
  tenantId = ALLOWED_TENANT,
): Promise<QuickActionTargetPayload> {
  const { memberModel, roleModel } = stubPageAccessModels(grantedPermissions);
  const payload = await buildSiteLayoutPayload(
    { _id: "qb-member" } as User,
    memberModel,
    roleModel,
    tenantId,
  );
  return payload.quickActions.actions as QuickActionTargetPayload;
}

async function registerPage(
  page: ControllerClass,
  components: Record<string, ComponentBuilder<unknown>>,
): Promise<() => void> {
  const meta = GetMetadata(page, PageMetadata);
  for (const [key, component] of Object.entries(components)) {
    meta.SetComponent(key, component);
  }
  return registerTestPage(page);
}

function actionKey(id: string): string {
  return `${CATEGORY_ID}:${id}`;
}

describe("[unit] implementations/dms/quick-actions — button targets", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    ImplementInterface(quickActionsInterface, quickActionsImpl.internal);

    for (const page of [
      PageQbGated,
      PageQbOpen,
      PageQbForeign,
      PageQbRecovery,
    ]) {
      cleanups.push(await registerPage(page, { table: page.table }));
    }
    cleanups.push(
      await registerPage(PageQbAmbiguous, {
        first: PageQbAmbiguous.first,
        second: PageQbAmbiguous.second,
      }),
    );

    const category = QuickActionCategory(CATEGORY_ID, {
      displayName: "Buttons",
    });
    const registered = Object.entries(TARGETS).map(([id, target]) =>
      QuickAction(id, {
        category,
        displayName: id,
        icon: "i-ph-plus",
        target,
      }),
    );
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

  it("serves the button's page, component and id to a caller holding its permission", async () => {
    const actions = await actionsFor([
      "pages.qb-gated",
      "pages.qb-gated.table.add",
    ]);

    expect(actions[actionKey("qb-gated")]?.target).to.deep.equal({
      type: "button",
      to: "/qb-gated",
      component: "table",
      button: INVITE_BUTTON,
    });
  });

  // The action declares no permission: the button's own decides.
  it("is left out for a caller who reaches the page but may not press the button", async () => {
    const actions = await actionsFor(["pages.qb-gated"]);

    expect(actions).to.not.have.property(actionKey("qb-gated"));
  });

  it("is left out for a caller who cannot reach the page, whatever the button allows", async () => {
    const actions = await actionsFor(["pages.qb-gated.table.add"]);

    expect(actions).to.not.have.property(actionKey("qb-gated"));
  });

  it("follows the page alone for a button that declares no permission", async () => {
    const actions = await actionsFor(["pages.qb-open"]);

    expect(actions).to.have.property(actionKey("qb-open"));
  });

  it("resolves a button gated by another component's action", async () => {
    const withoutIt = await actionsFor(["pages.qb-foreign"]);
    const withIt = await actionsFor([
      "pages.qb-foreign",
      "pages.qb-gated.table.add",
    ]);

    expect(withoutIt).to.not.have.property(actionKey("qb-foreign"));
    expect(withIt).to.have.property(actionKey("qb-foreign"));
  });

  it("is not served when no component of the page declares the button", async () => {
    const actions = await actionsFor(["*"]);

    expect(actions).to.not.have.property(actionKey("qb-unknown"));
  });

  it("refuses an unnamed target on a page where several components declare the button", async () => {
    const actions = await actionsFor(["pages.qb-ambiguous"]);

    expect(actions).to.not.have.property(actionKey("qb-ambiguous"));
    expect(actions[actionKey("qb-named")]?.target).to.deep.include({
      component: "second",
    });
  });

  it("keeps a recovery page's button while the gate denies the tenant", async () => {
    const actions = await actionsFor(
      ["pages.qb-recovery", "pages.qb-recovery.table.add"],
      DENIED_TENANT,
    );

    expect(actions).to.have.property(actionKey("qb-recovery"));
  });
});
