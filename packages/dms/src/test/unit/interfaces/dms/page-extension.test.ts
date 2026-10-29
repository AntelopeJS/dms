import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as pageImpl from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";

import * as pageInterface from "@antelopejs/interface-dms/page";
import {
  type CategoryInfo,
  GetPageLayoutBySlug,
  PageController,
  PageMetadata,
  pagesCategory,
  RegisterPage,
  RegisterPageExtension,
} from "@antelopejs/interface-dms/page";

import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { captureWarnings } from "../../../helpers/logging";
import {
  grantedTo,
  loadLayout,
  layoutKeys,
  layoutChildIds,
} from "../../../helpers/page-layout";
import {
  settle,
  definePage,
  definePermissionedPage,
  registerPage,
} from "./page-extension.helpers";
import { registerPageExtensionLifecycleCases } from "./page-extension-lifecycle.cases";

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
    RegisterPageExtension("pages.pe-append")(Extension);
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
    RegisterPageExtension("pages.pe-declaration-order")(Extension);
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
        .before("table");
      static bridge = CustomComponent("Bridge")
        .meta({ name: "Bridge" })
        .after("table");
    }
    RegisterPageExtension("pages.pe-anchored")(Extension);
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
        .before("content.table");
      static summary = CustomComponent("Summary")
        .meta({ name: "Summary" })
        .after("content.table");
    }
    RegisterPageExtension("pages.pe-child-anchor")(Extension);
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
        .after("table");
    }
    class AlphaExtension {
      static alphaBlock = CustomComponent("Alpha")
        .meta({ name: "Alpha" })
        .after("table");
    }
    class ZuluExtensionB {
      static zuluBlock = CustomComponent("Zulu")
        .meta({ name: "Zulu" })
        .after("table");
    }
    class AlphaExtensionB {
      static alphaBlock = CustomComponent("Alpha")
        .meta({ name: "Alpha" })
        .after("table");
    }

    RegisterPageExtension("pages.pe-race-a")(ZuluExtension);
    RegisterPageExtension("pages.pe-race-a")(AlphaExtension);
    RegisterPageExtension("pages.pe-race-b")(AlphaExtensionB);
    RegisterPageExtension("pages.pe-race-b")(ZuluExtensionB);
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
        .after("table")
        .order(10);
    }
    class ZuluExtension {
      static zuluBlock = CustomComponent("Zulu")
        .meta({ name: "Zulu" })
        .after("table")
        .order(-10);
    }
    RegisterPageExtension("pages.pe-order")(AlphaExtension);
    RegisterPageExtension("pages.pe-order")(ZuluExtension);
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
        .before("table");
    }

    RegisterPageExtension("pages.pe-deferred")(Extension);
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
        .before("table");
    }

    const captured = captureWarnings();
    try {
      RegisterPage()(Target);
      RegisterPageExtension("pages.pe-mid-registration")(Extension);
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

  it("settles the syncs of a page whose registration fails before serializing", async () => {
    const brokenCategory: CategoryInfo = {
      ...pagesCategory,
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- NotAPage intentionally violates ControllerClass so registration's failure and pending-sync settlement remain covered.
      category: class NotAPage {} as ControllerClass,
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
        .after("table");
    }
    RegisterPageExtension("pages.pe-failed-registration")(Extension);
    await settle();

    const meta = GetMetadata(Target, PageMetadata);
    let failed = false;
    try {
      await meta.Register();
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);

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
    RegisterPageExtension("pages.pe-permissions")(Extension);
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
        .after("table");
    }
    RegisterPageExtension("pages.pe-gated")(Extension);
    await settle();

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
    RegisterPageExtension("pages.pe-gated-child")(Extension);
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

  registerPageExtensionLifecycleCases();
});
