import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  buildSiteLayoutPayload,
  type SiteLayoutPayload,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  internal as pageInterfaceInternal,
  pagesCategory,
  RegisterDynamicMenuProvider,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { captureWarnings } from "../../../helpers/logging";
import {
  registerTestCategory,
  stubPageAccessModels,
  type TestCategory,
} from "../../../helpers/page-access";

type LayoutTree = SiteLayoutPayload["siteLayoutTree"];

const TENANT = "category-slug-tenant";
const MEMBER = { _id: "category-slug-member" } as User;
const COLLISION_MARKER = "claims the slug";
const UNKNOWN_CATEGORY_MARKER = "targets unknown category";
const SHARED_SLUG = "/category-slug-shared";

/**
 * A section heading, the shape `urlSlug: "/"` produces: it adds no segment of
 * its own, so it shares `pagesCategory`'s slug and any number of them may sit
 * side by side.
 */
function registerTransparentSection(id: string): TestCategory {
  return registerTestCategory(id, {
    displayName: `Transparent ${id}`,
    category: pagesCategory,
    type: "label",
    urlSlug: "/",
  });
}

/** A category with a URL of its own, which therefore owns a slug. */
function registerNavigableCategory(id: string, urlSlug: string): TestCategory {
  return registerTestCategory(id, {
    displayName: `Navigable ${id}`,
    category: pagesCategory,
    urlSlug,
  });
}

function buildLayout(granted: string[]): Promise<SiteLayoutPayload> {
  const { memberModel, roleModel } = stubPageAccessModels(granted);
  return buildSiteLayoutPayload(MEMBER, memberModel, roleModel, TENANT);
}

function findTreeNode(
  tree: LayoutTree,
  fullId: string,
): LayoutTree | undefined {
  let node: LayoutTree | undefined = tree;
  for (const part of fullId.split(".")) {
    node = node?.children[part];
  }
  return node;
}

function slugCollisionWarnings(messages: string[]): string[] {
  return messages.filter((message) => message.includes(COLLISION_MARKER));
}

describe("[unit] implementations/dms/page — category slug registry", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
  });

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it("marks a category sharing its parent's slug as url-transparent", () => {
    const section = registerTransparentSection("transparency-flag");
    cleanups.push(section.cleanup);
    const navigable = registerNavigableCategory(
      "navigable-flag",
      "navigable-flag",
    );
    cleanups.push(navigable.cleanup);

    expect(section.category.urlTransparent).to.equal(true);
    expect(section.category.fullSlug).to.equal(pagesCategory.fullSlug);
    expect(navigable.category.urlTransparent).to.equal(false);
  });

  // The registry used to be keyed by slug, so these three replaced each other
  // and warned about it — while the declaration is exactly what `urlSlug: "/"`
  // is for.
  it("keeps every transparent section under one parent, without warning", async () => {
    const captured = captureWarnings();
    let sections: TestCategory[] = [];
    try {
      sections = ["quiet-a", "quiet-b", "quiet-c"].map(
        registerTransparentSection,
      );
    } finally {
      captured.restore();
    }
    for (const section of sections) {
      cleanups.push(section.cleanup);
    }

    expect(slugCollisionWarnings(captured.messages)).to.be.empty;

    const payload = await buildLayout(
      sections.map(({ category }) => category.fullId),
    );
    for (const { category } of sections) {
      expect(findTreeNode(payload.siteLayoutTree, category.fullId)).to.exist;
    }
  });

  // The slug-keyed registry only held the last section registered, so
  // unregistering any earlier one bailed out before `removeFromTree` and left
  // a heading behind that nothing could remove short of a restart. The dropped
  // section must therefore be registered *first* — the shadowed position is
  // the one that used to leak.
  it("removes a transparent section from the tree when it unregisters", async () => {
    const dropped = registerTransparentSection("teardown-dropped");
    const kept = registerTransparentSection("teardown-kept");
    cleanups.push(kept.cleanup);
    const granted = [kept.category.fullId, dropped.category.fullId];

    const before = await buildLayout(granted);
    expect(findTreeNode(before.siteLayoutTree, dropped.category.fullId)).to
      .exist;

    dropped.cleanup();

    const after = await buildLayout(granted);
    expect(findTreeNode(after.siteLayoutTree, dropped.category.fullId)).to.not
      .exist;
    expect(findTreeNode(after.siteLayoutTree, kept.category.fullId)).to.exist;
  });

  // A provider addresses its category by `fullId`. Under the slug-keyed
  // registry a shadowed section was unreachable, and every provider targeting
  // one was dropped as "unknown category".
  it("resolves a dynamic menu provider targeting a shadowed section", async () => {
    const first = registerTransparentSection("provider-first");
    cleanups.push(first.cleanup);
    const shadowed = registerTransparentSection("provider-shadowed");
    cleanups.push(shadowed.cleanup);

    const captured = captureWarnings();
    const dispose = RegisterDynamicMenuProvider(
      shadowed.category.fullId,
      async () => [],
    );
    try {
      await buildLayout([shadowed.category.fullId]);
    } finally {
      dispose();
      captured.restore();
    }

    const unknown = captured.messages.filter((message) =>
      message.includes(UNKNOWN_CATEGORY_MARKER),
    );
    expect(unknown).to.be.empty;
  });

  it("still warns when two categories claim one real URL", () => {
    const captured = captureWarnings();
    const registered: TestCategory[] = [];
    try {
      registered.push(
        registerNavigableCategory("collision-first", SHARED_SLUG),
      );
      registered.push(
        registerNavigableCategory("collision-second", SHARED_SLUG),
      );
    } finally {
      captured.restore();
    }
    for (const category of registered) {
      cleanups.push(category.cleanup);
    }

    const warnings = slugCollisionWarnings(captured.messages);
    expect(warnings).to.have.lengthOf(1);
    expect(warnings[0]).to.include(registered[1].category.fullId);
    expect(warnings[0]).to.include(registered[0].category.fullId);
  });

  // The serialized map is what the client resolves a URL against, so a
  // transparent section in it would answer for its parent's slug — the winner
  // decided by module registration order.
  it("serializes navigable categories only, keyed by slug", async () => {
    const section = registerTransparentSection("payload-section");
    cleanups.push(section.cleanup);
    const navigable = registerNavigableCategory(
      "payload-navigable",
      "payload-navigable",
    );
    cleanups.push(navigable.cleanup);

    const payload = await buildLayout([
      section.category.fullId,
      navigable.category.fullId,
    ]);
    const serialized = payload.siteLayout.categories;

    expect(serialized[navigable.category.fullSlug]?.fullId).to.equal(
      navigable.category.fullId,
    );
    expect(
      Object.values(serialized).map((entry) => entry.fullId),
    ).to.not.include(section.category.fullId);
    // Still reachable where the sidebar reads it: the tree is keyed by fullId.
    expect(findTreeNode(payload.siteLayoutTree, section.category.fullId)).to
      .exist;
  });
});
