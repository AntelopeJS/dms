import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  buildSiteLayoutPayload,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  type CategoryInfo,
  PageController,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { captureWarnings } from "../../../helpers/logging";
import {
  registerTestCategory,
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const TENANT = "missing-category-tenant";
const MEMBER = { _id: "missing-category-member" } as User;
const OWNER_PERMISSIONS = ["*"];
const PLACEHOLDER_LABEL = "none";

type SiteLayoutTree = Awaited<
  ReturnType<typeof buildSiteLayoutPayload>
>["siteLayoutTree"];

async function pagesLevel(permissions: string[]): Promise<SiteLayoutTree> {
  const { memberModel, roleModel } = stubPageAccessModels(permissions);
  const payload = await buildSiteLayoutPayload(
    MEMBER,
    memberModel,
    roleModel,
    TENANT,
  );
  const pages = payload.siteLayoutTree.children[pagesCategory.id];
  if (!pages) throw new Error("the pages category is not in the tree");
  return pages;
}

function displayNames(level: SiteLayoutTree): string[] {
  return Object.values(level.children).map((child) => child.displayName);
}

// Never registered: only its identity is needed to place a page under it.
function unregisteredCategory(id: string): CategoryInfo {
  return {
    id,
    fullId: `${pagesCategory.fullId}.${id}`,
    fullSlug: `/${id}`,
    displayName: id,
    category: pagesCategory,
  };
}

describe("[unit] implementations/dms/page — entries of a missing category", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
  });

  it("lists the pages of an unregistered label category at its parent's level", async () => {
    const reports = registerTestCategory("missing-reports", {
      displayName: "Reports",
      category: pagesCategory,
      type: "label",
    });
    const removePage = await registerTestPage(
      PageController("missing-reports-sales", {
        displayName: "Sales",
        category: reports.category,
      }),
    );
    const captured = captureWarnings();

    try {
      reports.cleanup();
      const pages = await pagesLevel(OWNER_PERMISSIONS);

      expect(pages.children["missing-reports"]).to.equal(undefined);
      expect(pages.children["missing-reports-sales"]?.fullId).to.equal(
        "pages.missing-reports.missing-reports-sales",
      );
      expect(pages.childrenOrders).to.include("missing-reports-sales");
      expect(pages.childrenOrders).to.not.include("missing-reports");
      expect(displayNames(pages)).to.not.include(PLACEHOLDER_LABEL);
    } finally {
      captured.restore();
      removePage();
    }

    const reported = captured.messages.filter((message) =>
      message.includes('"pages.missing-reports"'),
    );
    expect(reported).to.have.lengthOf(1);
    expect(reported[0]).to.include(
      "pages.missing-reports.missing-reports-sales",
    );
  });

  it("lists a page registered under a never-registered category at its parent's level", async () => {
    const captured = captureWarnings();
    let removePage: () => void = () => undefined;

    try {
      removePage = await registerTestPage(
        PageController("missing-ghost-sales", {
          displayName: "Ghost sales",
          category: unregisteredCategory("missing-ghost"),
        }),
      );
      const pages = await pagesLevel(OWNER_PERMISSIONS);

      expect(pages.children["missing-ghost"]).to.equal(undefined);
      expect(pages.children["missing-ghost-sales"]?.fullId).to.equal(
        "pages.missing-ghost.missing-ghost-sales",
      );
      expect(displayNames(pages)).to.not.include(PLACEHOLDER_LABEL);
    } finally {
      captured.restore();
      removePage();
    }

    const reported = captured.messages.filter((message) =>
      message.includes('"pages.missing-ghost"'),
    );
    expect(reported).to.have.lengthOf(1);
    expect(reported[0]).to.include("pages.missing-ghost.missing-ghost-sales");
  });

  it("keeps the registered sibling when a hoisted entry has its id", async () => {
    const removeSibling = await registerTestPage(
      PageController("missing-clash", {
        displayName: "Registered sibling",
        category: pagesCategory,
      }),
    );
    const captured = captureWarnings();
    let removeHoisted: () => void = () => undefined;

    try {
      removeHoisted = await registerTestPage(
        PageController("missing-clash", {
          displayName: "Hoisted entry",
          category: unregisteredCategory("missing-clash-parent"),
        }),
      );
      const pages = await pagesLevel(OWNER_PERMISSIONS);

      expect(pages.children["missing-clash"]?.displayName).to.equal(
        "Registered sibling",
      );
      expect(displayNames(pages)).to.not.include("Hoisted entry");
    } finally {
      captured.restore();
      removeHoisted();
      removeSibling();
    }

    const collisions = captured.messages.filter((message) =>
      message.includes("collides with"),
    );
    expect(collisions).to.have.lengthOf(1);
    expect(collisions[0]).to.include(
      "pages.missing-clash-parent.missing-clash",
    );
  });

  // The container has no permission of its own: checking one on an empty id
  // denied it to every non-owner, and took the page with it.
  it("shows a hoisted page to a non-owner who may open it", async () => {
    const pageFullId = "pages.missing-member-parent.missing-member-page";
    const captured = captureWarnings();
    let removePage: () => void = () => undefined;

    try {
      removePage = await registerTestPage(
        PageController("missing-member-page", {
          displayName: "Member page",
          category: unregisteredCategory("missing-member-parent"),
        }),
      );
      const pages = await pagesLevel([pagesCategory.fullId, pageFullId]);
      const hoisted = pages.children["missing-member-page"];

      expect(hoisted?.fullId).to.equal(pageFullId);
      expect(hoisted?.hasAccess).to.equal(true);
      expect(displayNames(pages)).to.not.include(PLACEHOLDER_LABEL);
    } finally {
      captured.restore();
      removePage();
    }
  });
});
