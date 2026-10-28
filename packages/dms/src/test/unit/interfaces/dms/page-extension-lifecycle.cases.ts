import { GetMetadata } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as pageImpl from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";

import {
  GetRegisteredPageIds,
  type PageExtensionInfo,
  PageMetadata,
  internal as pageInternal,
  RegisterPageExtension,
} from "@antelopejs/interface-dms/page";
import { GetPendingPageExtensions } from "@antelopejs/interface-dms/page/internal/registry";

import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { captureErrors } from "../../../helpers/logging";
import { layoutKeys, layoutChildIds } from "../../../helpers/page-layout";
import {
  settle,
  definePage,
  registerPage,
  failingComponent,
} from "./page-extension.helpers";

export function registerPageExtensionLifecycleCases(): void {
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
    RegisterPageExtension("pages.pe-page-gone")(Extension);
    await settle();
    expect(
      permissionsImpl.GetPermission("pages.pe-page-gone.strandedBlock"),
    ).to.not.equal(undefined);

    const pageInfo = GetMetadata(Target, PageMetadata).pageInfo;
    pageImpl.internal.RegisterPage.unregister(
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This test has registered Target; PageMetadata also represents unregistered controllers and leaves pageInfo optional.
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
    RegisterPageExtension("pages.pe-hot-reload")(Extension);
    await settle();

    const pageInfo = GetMetadata(Target, PageMetadata).pageInfo;
    pageImpl.internal.RegisterPage.unregister(
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- This test has registered Target; PageMetadata also represents unregistered controllers and leaves pageInfo optional.
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

  it("skips an extension whose key collides with a component of the target page", async () => {
    class Target extends definePage("pe-collision-page") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class CollidingExtension {
      static table = CustomComponent("Other").meta({ name: "Other" });
    }
    const captured = captureErrors();
    try {
      RegisterPageExtension("pages.pe-collision-page")(CollidingExtension);
      await settle();
    } finally {
      captured.restore();
    }

    expect(await layoutKeys("/pe-collision-page")).to.deep.equal(["table"]);
    expect(captured.messages).to.have.lengthOf(1);
    expect(captured.messages[0]).to.contain("CollidingExtension");
    expect(captured.messages[0]).to.contain("pages.pe-collision-page");
    expect(captured.messages[0]).to.contain("table");
  });

  it("skips an extension whose key collides with a sibling of a child anchor", async () => {
    class Target extends definePage("pe-child-collision") {
      static content = CustomComponent("Content")
        .child("banner", CustomComponent("ExistingBanner"))
        .child("table", CustomComponent("Table"));
    }
    await registerPage(Target);

    class SiblingExtension {
      static banner = CustomComponent("OtherBanner").before("content.table");
    }
    const captured = captureErrors();
    try {
      RegisterPageExtension("pages.pe-child-collision")(SiblingExtension);
      await settle();
    } finally {
      captured.restore();
    }

    expect(
      await layoutChildIds("/pe-child-collision", "content"),
    ).to.deep.equal(["banner", "table"]);
    expect(captured.messages).to.have.lengthOf(1);
    expect(captured.messages[0]).to.contain("SiblingExtension");
    expect(captured.messages[0]).to.contain("banner");
  });

  it("skips an extension whose key another extension already injected", async () => {
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
    RegisterPageExtension("pages.pe-collision-ext")(FirstExtension);
    await settle();

    const captured = captureErrors();
    try {
      RegisterPageExtension("pages.pe-collision-ext")(SecondExtension);
      await settle();
    } finally {
      captured.restore();
    }

    expect(await layoutKeys("/pe-collision-ext")).to.deep.equal([
      "table",
      "sharedKey",
    ]);
    expect(captured.messages).to.have.lengthOf(1);
    expect(captured.messages[0]).to.contain("SecondExtension");
    expect(captured.messages[0]).to.contain("sharedKey");
    expect(captured.messages[0]).to.contain("FirstExtension");
  });

  it("skips an extension anchored on a key the target page does not declare", async () => {
    class Target extends definePage("pe-bad-anchor") {
      static table = CustomComponent("Table").meta({ name: "Table" });
    }
    await registerPage(Target);

    class StrayAnchorExtension {
      static block = CustomComponent("Block")
        .meta({ name: "Block" })
        .after("nowhere");
    }
    const captured = captureErrors();
    try {
      RegisterPageExtension("pages.pe-bad-anchor")(StrayAnchorExtension);
      await settle();
    } finally {
      captured.restore();
    }

    expect(await layoutKeys("/pe-bad-anchor")).to.deep.equal(["table"]);
    expect(captured.messages).to.have.lengthOf(1);
    expect(captured.messages[0]).to.contain("StrayAnchorExtension");
    expect(captured.messages[0]).to.contain("nowhere");
    expect(captured.messages[0]).to.contain("pages.pe-bad-anchor");
  });

  it("holds an extension whose target page id no module registers", async () => {
    class PendingExtension {
      static block = CustomComponent("Block").meta({ name: "Block" });
    }
    RegisterPageExtension("pages.pe-never-registered")(PendingExtension);
    await settle();

    expect(GetPendingPageExtensions()).to.deep.contain({
      extensionName: "PendingExtension",
      targetFullId: "pages.pe-never-registered",
    });
    expect(GetRegisteredPageIds()).to.not.contain("pages.pe-never-registered");
  });

  it("refuses an extension that names no target page", () => {
    class Extension {
      static block = CustomComponent("Block").meta({ name: "Block" });
    }
    expect(() => RegisterPageExtension("  ")(Extension)).to.throw(/full id/);
  });
}
