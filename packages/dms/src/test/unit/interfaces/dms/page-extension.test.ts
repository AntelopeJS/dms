// A page extension is a class carrying only static component fields — that is the shape the decorator consumes.

import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as pageImpl from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import { Component } from "@antelopejs/interface-dms/component";
import type {
  RoleModel,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import * as pageInterface from "@antelopejs/interface-dms/page";
import {
  type CategoryInfo,
  GetPageLayoutBySlug,
  PageController,
  type PageExtensionInfo,
  type PageLayout,
  PageMetadata,
  internal as pageInternal,
  pagesCategory,
  RegisterPage,
  RegisterPageExtension,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { captureWarnings } from "../../../helpers/logging";

// Page registration and extension syncing are promise-chained but do no I/O:
// one macrotask hop is enough for every pending microtask to settle.
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function definePage(id: string) {
  return PageController(id, {
    displayName: `Extension target ${id}`,
    category: pagesCategory,
    publicAccess: true,
  });
}

/** A page whose layout goes through the permission filter, unlike definePage. */
function definePermissionedPage(id: string) {
  return PageController(id, {
    displayName: `Gated extension target ${id}`,
    category: pagesCategory,
  });
}

async function registerPage(cl: ControllerClass): Promise<void> {
  RegisterPage()(cl);
  await settle();
}

/**
 * A component whose serialization always throws. The rejection is given a
 * handler up front so Node does not report it as late-handled: the component
 * only awaits it when the extension sync reaches it.
 */
function failingComponent(): Component {
  const rejected = Promise.reject(new Error("component boom"));
  rejected.catch(() => undefined);
  return new Component(rejected as never, { name: "Failing" });
}

interface LayoutCaller {
  user: User | undefined;
  memberModel: TenantMemberModel;
  roleModel: RoleModel;
}

const ANONYMOUS: LayoutCaller = {
  user: undefined,
  memberModel: {} as TenantMemberModel,
  roleModel: {} as RoleModel,
};

function grantedTo(permissions: string[]): LayoutCaller {
  return {
    user: { _id: "pe-user" } as User,
    memberModel: {
      getByUser: async () => ({ roleIds: ["pe-role"] }),
    } as unknown as TenantMemberModel,
    roleModel: {
      getBy: async () => [{ permissions }],
    } as unknown as RoleModel,
  };
}

async function loadLayout(
  fullSlug: string,
  caller = ANONYMOUS,
): Promise<PageLayout> {
  const handler = GetPageLayoutBySlug(fullSlug);
  expect(handler, `no layout handler registered for ${fullSlug}`).to.not.equal(
    undefined,
  );
  return (handler as NonNullable<typeof handler>)(
    caller.user,
    caller.memberModel,
    caller.roleModel,
    "pe-tenant",
  );
}

async function layoutKeys(
  fullSlug: string,
  caller = ANONYMOUS,
): Promise<string[]> {
  return Object.keys((await loadLayout(fullSlug, caller)).components);
}

async function layoutChildIds(
  fullSlug: string,
  rootKey: string,
): Promise<string[]> {
  const handler = GetPageLayoutBySlug(fullSlug);
  expect(handler, `no layout handler registered for ${fullSlug}`).to.not.equal(
    undefined,
  );
  const layout = await (handler as NonNullable<typeof handler>)(
    ANONYMOUS.user,
    ANONYMOUS.memberModel,
    ANONYMOUS.roleModel,
    "pe-tenant",
  );
  return layout.components[rootKey]?.children?.map((child) => child.id) ?? [];
}

describe("[unit] interfaces/dms/page — @RegisterPageExtension", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(pageInterface, pageImpl);
  });

  it("appends an extension component after the page's own components", async () => {
    class Target extends definePage("pe-append") {
      static header = CustomComponent("Header").meta({ name: "Header" });
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class Extension {
      static footNote = CustomComponent("FootNote").meta({ name: "Foot note" });
    }
    RegisterPageExtension(Target)(Extension);
    await settle();

    expect(await layoutKeys("/pe-append")).to.deep.equal([
      "header",
      "table",
      "footNote",
    ]);
  });

  it("keeps the declaration order of one extension's own components", async () => {
    class Target extends definePage("pe-declaration-order") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class Extension {
      static zulu = CustomComponent("Zulu").meta({ name: "Zulu" });
      static alpha = CustomComponent("Alpha").meta({ name: "Alpha" });
    }
    RegisterPageExtension(Target)(Extension);
    await settle();

    expect(await layoutKeys("/pe-declaration-order")).to.deep.equal([
      "table",
      "zulu",
      "alpha",
    ]);
  });

  it("places a component before and after the anchor it references", async () => {
    class Target extends definePage("pe-anchored") {
      static header = CustomComponent("Header").meta({ name: "Header" });
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class Extension {
      static banner = CustomComponent("Banner")
        .meta({ name: "Banner" })
        .before(Target.table);
      static bridge = CustomComponent("Bridge")
        .meta({ name: "Bridge" })
        .after(Target.table);
    }
    RegisterPageExtension(Target)(Extension);
    await settle();

    expect(await layoutKeys("/pe-anchored")).to.deep.equal([
      "header",
      "banner",
      "table",
      "bridge",
    ]);
  });

  it("places extension components beside a targeted child", async () => {
    class Target extends definePage("pe-child-anchor") {
      static content = CustomComponent("Content")
        .meta({ name: "Content" })
        .child("table", CustomComponent("Table").meta({ name: "Table" }));
    }
    await registerPage(Target);

    class Extension {
      static banner = CustomComponent("Banner")
        .meta({ name: "Banner" })
        .before(Target.content.targetChild("table"));
      static summary = CustomComponent("Summary")
        .meta({ name: "Summary" })
        .after(Target.content.targetChild("table"));
    }
    RegisterPageExtension(Target)(Extension);
    await settle();

    expect(await layoutChildIds("/pe-child-anchor", "content")).to.deep.equal([
      "banner",
      "table",
      "summary",
    ]);
  });

  it("keeps the same order whichever module registers first", async () => {
    class TargetA extends definePage("pe-race-a") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    class TargetB extends definePage("pe-race-b") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(TargetA);
    await registerPage(TargetB);

    class ZuluExtension {
      static zuluBlock = CustomComponent("Zulu")
        .meta({ name: "Zulu" })
        .after(TargetA.table);
    }
    class AlphaExtension {
      static alphaBlock = CustomComponent("Alpha")
        .meta({ name: "Alpha" })
        .after(TargetA.table);
    }
    class ZuluExtensionB {
      static zuluBlock = CustomComponent("Zulu")
        .meta({ name: "Zulu" })
        .after(TargetB.table);
    }
    class AlphaExtensionB {
      static alphaBlock = CustomComponent("Alpha")
        .meta({ name: "Alpha" })
        .after(TargetB.table);
    }

    // Page A: the "Zulu module" starts first. Page B: the "Alpha module" does.
    RegisterPageExtension(TargetA)(ZuluExtension);
    RegisterPageExtension(TargetA)(AlphaExtension);
    RegisterPageExtension(TargetB)(AlphaExtensionB);
    RegisterPageExtension(TargetB)(ZuluExtensionB);
    await settle();

    const startedZuluFirst = await layoutKeys("/pe-race-a");
    const startedAlphaFirst = await layoutKeys("/pe-race-b");

    expect(startedZuluFirst).to.deep.equal(startedAlphaFirst);
    expect(startedZuluFirst).to.deep.equal([
      "table",
      "alphaBlock",
      "zuluBlock",
    ]);
  });

  it("lets order() win over the extension-name tie-break", async () => {
    class Target extends definePage("pe-order") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class AlphaExtension {
      static alphaBlock = CustomComponent("Alpha")
        .meta({ name: "Alpha" })
        .after(Target.table)
        .order(10);
    }
    class ZuluExtension {
      static zuluBlock = CustomComponent("Zulu")
        .meta({ name: "Zulu" })
        .after(Target.table)
        .order(-10);
    }
    RegisterPageExtension(Target)(AlphaExtension);
    RegisterPageExtension(Target)(ZuluExtension);
    await settle();

    expect(await layoutKeys("/pe-order")).to.deep.equal([
      "table",
      "zuluBlock",
      "alphaBlock",
    ]);
  });

  it("applies an extension registered before its target page", async () => {
    class Target extends definePage("pe-deferred") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }

    class Extension {
      static earlyBlock = CustomComponent("Early")
        .meta({ name: "Early" })
        .before(Target.table);
    }
    // The extending module starts first: the target page has not run its
    // @RegisterPage yet, so the injection is held until it does.
    RegisterPageExtension(Target)(Extension);
    await settle();
    expect(GetPageLayoutBySlug("/pe-deferred")).to.equal(undefined);

    await registerPage(Target);

    expect(await layoutKeys("/pe-deferred")).to.deep.equal([
      "earlyBlock",
      "table",
    ]);
  });

  it("applies an extension registered while its target page registers", async () => {
    class Target extends definePage("pe-mid-registration") {
      static header = CustomComponent("Header").meta({ name: "Header" });
      static intro = CustomComponent("Intro").meta({ name: "Intro" });
      static table = CustomComponent("Table").meta({ name: "Table" });
    }

    class Extension {
      static banner = CustomComponent("Banner")
        .meta({ name: "Banner" })
        .before(Target.table);
    }

    // No settle() in between: the extending module registers while the page is
    // still serializing its own components. The page is already in the registry
    // at that point, but "table" is not yet a key it declares — an anchor
    // resolved then falls to the end of the page, and the registration's own
    // rebuild puts it back where it belongs, so the warning is the only lasting
    // trace of a graft that read a half-built page.
    const captured = captureWarnings();
    try {
      RegisterPage()(Target);
      RegisterPageExtension(Target)(Extension);
      await settle();
    } finally {
      captured.restore();
    }

    expect(
      captured.messages.filter((message) => message.includes("anchors on")),
    ).to.deep.equal([]);
    expect(await layoutKeys("/pe-mid-registration")).to.deep.equal([
      "header",
      "intro",
      "banner",
      "table",
    ]);
  });

  // The failure lands after the page is published and before it serializes
  // anything — the window in which extensions are already held back.
  it("settles the syncs of a page whose registration fails before serializing", async () => {
    const brokenCategory: CategoryInfo = {
      ...pagesCategory,
      category: class NotAPage {} as unknown as ControllerClass,
    };
    class Target extends PageController("pe-failed-registration", {
      displayName: "Broken parent",
      category: brokenCategory,
      publicAccess: true,
    }) {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }

    class Extension {
      static block = CustomComponent("Block")
        .meta({ name: "Block" })
        .after(Target.table);
    }
    RegisterPageExtension(Target)(Extension);
    await settle();

    const meta = GetMetadata(Target, PageMetadata);
    let failed = false;
    try {
      await meta.Register();
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);

    // Everything on this page queues behind the gate, the teardown of its
    // extensions included, so a registration that throws on its way must still
    // release it.
    const outcome = await Promise.race([
      meta.SyncExtensions().then(() => "settled"),
      new Promise((resolve) => setTimeout(() => resolve("stuck"), 100)),
    ]);
    expect(outcome).to.equal("settled");
  });

  it("gives an injected component its own node in the target's permission tree", async () => {
    class Target extends definePage("pe-permissions") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class Extension {
      static quotaBanner = CustomComponent("Quota")
        .meta({ name: "Quota banner" })
        .child(
          "details",
          CustomComponent("QuotaDetails").meta({ name: "Quota details" }),
        );
    }
    RegisterPageExtension(Target)(Extension);
    await settle();

    const permission = permissionsImpl.GetPermission(
      "pages.pe-permissions.quotaBanner",
    );
    expect(permission?.title).to.equal("Quota banner");
    expect(
      permissionsImpl.GetPermission("pages.pe-permissions.quotaBanner.details")
        ?.title,
    ).to.equal("Quota details");
  });

  it("withholds an injected component from a caller without its permission", async () => {
    class Target extends definePermissionedPage("pe-gated") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class Extension {
      static gatedBlock = CustomComponent("Gated")
        .meta({ name: "Gated" })
        .child(
          "details",
          CustomComponent("GatedDetails").meta({ name: "Details" }),
        )
        .after(Target.table);
    }
    RegisterPageExtension(Target)(Extension);
    await settle();

    // Granted the page's own component but not the injected one: the block is
    // gated on its own node, exactly like a component the page declares.
    expect(
      await layoutKeys("/pe-gated", grantedTo(["pages.pe-gated.table"])),
    ).to.deep.equal(["table"]);

    const parentOnly = await loadLayout(
      "/pe-gated",
      grantedTo(["pages.pe-gated.table", "pages.pe-gated.gatedBlock"]),
    );
    expect(Object.keys(parentOnly.components)).to.deep.equal([
      "table",
      "gatedBlock",
    ]);
    expect(parentOnly.components.gatedBlock?.children).to.deep.equal([]);

    expect(await layoutKeys("/pe-gated")).to.deep.equal([]);
  });

  it("serves an injected child only with its exact permission", async () => {
    class Target extends definePermissionedPage("pe-gated-child") {}
    await registerPage(Target);

    class Extension {
      static block = CustomComponent("Block").child(
        "details",
        CustomComponent("Details").meta({ name: "Details" }),
      );
    }
    RegisterPageExtension(Target)(Extension);
    await settle();

    const layout = await loadLayout(
      "/pe-gated-child",
      grantedTo([
        "pages.pe-gated-child.block",
        "pages.pe-gated-child.block.details",
      ]),
    );
    expect(
      layout.components.block?.children?.map((child) => child.id),
    ).to.deep.equal(["details"]);
  });

  it("removes injected components when the extending module unregisters", async () => {
    class Target extends definePage("pe-teardown") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    const info: PageExtensionInfo = {
      extensionName: "TeardownExtension",
      targetFullId: "pages.pe-teardown",
      components: [
        {
          key: "transientBlock",
          component: CustomComponent("Transient")
            .meta({ name: "Transient" })
            .child(
              "details",
              CustomComponent("TransientDetails").meta({ name: "Details" }),
            ),
          side: "end",
          order: 0,
        },
      ],
    };

    pageInternal.RegisterPageExtension.register(info);
    await settle();
    expect(await layoutKeys("/pe-teardown")).to.deep.equal([
      "table",
      "transientBlock",
    ]);

    pageInternal.RegisterPageExtension.unregister(info);
    await settle();
    expect(await layoutKeys("/pe-teardown")).to.deep.equal(["table"]);
    expect(
      permissionsImpl.GetPermission("pages.pe-teardown.transientBlock"),
    ).to.equal(undefined);
    expect(
      permissionsImpl.GetPermission("pages.pe-teardown.transientBlock.details"),
    ).to.equal(undefined);
  });

  it("takes injected components down when the target page unregisters", async () => {
    class Target extends definePage("pe-page-gone") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class Extension {
      static strandedBlock = CustomComponent("Stranded").meta({
        name: "Stranded",
      });
    }
    RegisterPageExtension(Target)(Extension);
    await settle();
    expect(
      permissionsImpl.GetPermission("pages.pe-page-gone.strandedBlock"),
    ).to.not.equal(undefined);

    const pageInfo = GetMetadata(Target, PageMetadata).pageInfo;
    pageImpl.internal.RegisterPage.unregister(
      pageInfo as NonNullable<typeof pageInfo>,
    );
    await settle();

    expect(
      permissionsImpl.GetPermission("pages.pe-page-gone.strandedBlock"),
    ).to.equal(undefined);
  });

  it("drops only the component that failed to register", async () => {
    class Target extends definePage("pe-rollback") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    const failing = failingComponent();
    const info: PageExtensionInfo = {
      extensionName: "RollbackExtension",
      targetFullId: "pages.pe-rollback",
      components: [
        {
          key: "goodBlock",
          component: CustomComponent("Good").meta({ name: "Good" }),
          side: "end",
          order: 0,
        },
        { key: "badBlock", component: failing, side: "end", order: 0 },
      ],
    };

    pageInternal.RegisterPageExtension.register(info);
    await settle();

    expect(await layoutKeys("/pe-rollback")).to.deep.equal([
      "table",
      "goodBlock",
    ]);
    expect(
      permissionsImpl.GetPermission("pages.pe-rollback.goodBlock"),
    ).to.not.equal(undefined);
    expect(
      permissionsImpl.GetPermission("pages.pe-rollback.badBlock"),
    ).to.equal(undefined);

    // The failure must not be replayed on the next sync of that page.
    pageInternal.RegisterPageExtension.register({
      extensionName: "ZuluRollbackExtension",
      targetFullId: "pages.pe-rollback",
      components: [
        {
          key: "otherBlock",
          component: CustomComponent("Other").meta({ name: "Other" }),
          side: "end",
          order: 0,
        },
      ],
    });
    await settle();

    expect(await layoutKeys("/pe-rollback")).to.deep.equal([
      "table",
      "goodBlock",
      "otherBlock",
    ]);
  });

  it("survives a failing component registered before its target page", async () => {
    class Target extends definePage("pe-deferred-failure") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }

    const failing = failingComponent();
    pageInternal.RegisterPageExtension.register({
      extensionName: "DeferredFailureExtension",
      targetFullId: "pages.pe-deferred-failure",
      components: [
        { key: "badBlock", component: failing, side: "end", order: 0 },
        {
          key: "goodBlock",
          component: CustomComponent("Good").meta({ name: "Good" }),
          side: "end",
          order: 0,
        },
      ],
    });
    await settle();

    // The other registration order: the failure must not break the page's own
    // registration either — it is consumed before Register() awaits the sync.
    await registerPage(Target);

    expect(await layoutKeys("/pe-deferred-failure")).to.deep.equal([
      "table",
      "goodBlock",
    ]);
    expect(
      permissionsImpl.GetPermission("pages.pe-deferred-failure.badBlock"),
    ).to.equal(undefined);
  });

  it("keeps injected components across a hot reload of the target page", async () => {
    class Target extends definePage("pe-hot-reload") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class Extension {
      static reloadedBlock = CustomComponent("Reloaded")
        .meta({ name: "Reloaded" })
        .child(
          "details",
          CustomComponent("ReloadedDetails").meta({ name: "Details" }),
        );
    }
    RegisterPageExtension(Target)(Extension);
    await settle();

    // A dev hot reload: the page unregisters and comes straight back under a
    // new class. The old metadata's teardown must not strip the replacement's
    // permissions, which are derived from the same page id.
    const pageInfo = GetMetadata(Target, PageMetadata).pageInfo;
    pageImpl.internal.RegisterPage.unregister(
      pageInfo as NonNullable<typeof pageInfo>,
    );
    class ReloadedTarget extends definePage("pe-hot-reload") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(ReloadedTarget);
    await settle();

    expect(await layoutKeys("/pe-hot-reload")).to.deep.equal([
      "table",
      "reloadedBlock",
    ]);
    expect(
      permissionsImpl.GetPermission("pages.pe-hot-reload.reloadedBlock"),
    ).to.not.equal(undefined);
    expect(
      permissionsImpl.GetPermission(
        "pages.pe-hot-reload.reloadedBlock.details",
      ),
    ).to.not.equal(undefined);
  });

  it("rejects a key that collides with a component of the target page", async () => {
    class Target extends definePage("pe-collision-page") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class Extension {
      static table = CustomComponent("Other").meta({ name: "Other" });
    }
    expect(() => RegisterPageExtension(Target)(Extension)).to.throw(/table/);
  });

  it("rejects a key that collides with a sibling of a child anchor", async () => {
    class Target extends definePage("pe-child-collision") {
      static content = CustomComponent("Content")
        .child("banner", CustomComponent("ExistingBanner"))
        .child("table", CustomComponent("Table"));
    }
    await registerPage(Target);

    class Extension {
      static banner = CustomComponent("OtherBanner").before(
        Target.content.targetChild("table"),
      );
    }

    expect(() => RegisterPageExtension(Target)(Extension)).to.throw(/banner/);
  });

  it("rejects a key already injected by another extension", async () => {
    class Target extends definePage("pe-collision-ext") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class FirstExtension {
      static sharedKey = CustomComponent("First").meta({ name: "First" });
    }
    class SecondExtension {
      static sharedKey = CustomComponent("Second").meta({ name: "Second" });
    }
    RegisterPageExtension(Target)(FirstExtension);
    await settle();

    expect(() => RegisterPageExtension(Target)(SecondExtension)).to.throw(
      /sharedKey/,
    );
  });

  it("rejects an anchor that is not a component of the target page", async () => {
    class Target extends definePage("pe-bad-anchor") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    const foreign = CustomComponent("Foreign").meta({ name: "Foreign" });
    class Extension {
      static block = CustomComponent("Block")
        .meta({ name: "Block" })
        .after(foreign);
    }
    expect(() => RegisterPageExtension(Target)(Extension)).to.throw(/anchor/i);
  });

  it("rejects a target class that is not a page", async () => {
    class NotAPage {}
    class Extension {
      static block = CustomComponent("Block").meta({ name: "Block" });
    }
    expect(() =>
      RegisterPageExtension(NotAPage as unknown as ControllerClass)(Extension),
    ).to.throw(/not a page/);
  });
});
