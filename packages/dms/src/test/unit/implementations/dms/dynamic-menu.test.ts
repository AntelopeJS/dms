import { expect } from "chai";
import { buildSiteLayoutPayload } from "../../../../implementations/dms/page";
import { PageController, pagesCategory } from "@antelopejs/interface-dms/page";
import {
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";
import { userFixture } from "../../../helpers/user-fixture";
import {
  CATEGORY_FULL_ID,
  CATEGORY_ID,
  cleanups,
  OWNER,
  PAGE_SLUG,
  projectsCategory,
  registerMenuFixtures,
  registerProvider,
  resolveCategoryNode,
  RESTRICTED_PERMISSION,
  runCleanups,
  runSuiteCleanups,
  TENANT_A,
  TENANT_B,
} from "../../../helpers/dynamic-menu-fixtures";

describe("[unit] implementations/dms/page — dynamic menu providers", () => {
  before(registerMenuFixtures);

  afterEach(runCleanups);

  after(runSuiteCleanups);

  it("grafts a tenant's entries without leaking them to another tenant", async () => {
    cleanups.push(
      registerProvider((_user, tenantId) => [
        {
          id: `project-${tenantId}`,
          displayName: `Project of ${tenantId}`,
          fullSlug: PAGE_SLUG,
          query: { project: tenantId },
        },
      ]),
    );

    const nodeA = await resolveCategoryNode(OWNER, TENANT_A);
    const nodeB = await resolveCategoryNode(OWNER, TENANT_B);

    expect(nodeA?.childrenOrders).to.deep.equal([`project-${TENANT_A}`]);
    expect(nodeB?.childrenOrders).to.deep.equal([`project-${TENANT_B}`]);
  });

  it("never grafts onto the global navigation tree", async () => {
    cleanups.push(
      registerProvider(() => [
        {
          id: "leaking-project",
          displayName: "Leaking project",
          fullSlug: PAGE_SLUG,
        },
      ]),
    );

    await resolveCategoryNode(OWNER, TENANT_A);
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal([]);
  });

  it("sorts dynamic and static entries of the category together by order", async () => {
    const staticPage = PageController("dyn-static-cta", {
      displayName: "New project",
      category: projectsCategory(),
      order: 100,
      publicAccess: true,
      variant: "accent",
    });
    cleanups.push(await registerTestPage(staticPage));

    cleanups.push(
      registerProvider(() => [
        {
          id: "project-b",
          displayName: "B",
          fullSlug: PAGE_SLUG,
          order: 2,
        },
        {
          id: "project-a",
          displayName: "A",
          fullSlug: PAGE_SLUG,
          order: 1,
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal([
      "project-a",
      "project-b",
      "dyn-static-cta",
    ]);
    expect(node?.children["dyn-static-cta"]?.variant).to.equal("accent");
  });

  it("never lets a dynamic entry shadow a static one with the same id", async () => {
    const staticPage = PageController("dyn-shadowed", {
      displayName: "Static entry",
      category: projectsCategory(),
      publicAccess: true,
    });
    cleanups.push(await registerTestPage(staticPage));

    cleanups.push(
      registerProvider(() => [
        {
          id: "dyn-shadowed",
          displayName: "Impostor",
          fullSlug: PAGE_SLUG,
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal(["dyn-shadowed"]);
    expect(node?.children["dyn-shadowed"]?.displayName).to.equal(
      "Static entry",
    );
  });
});

describe("[unit] implementations/dms/page — dynamic menu providers, entries a resolver filtered or the caller cannot reach", () => {
  before(registerMenuFixtures);

  afterEach(runCleanups);

  after(runSuiteCleanups);

  it("keeps the entries a resolver filtered out of reach", async () => {
    cleanups.push(
      registerProvider(() => [
        {
          id: "granted",
          displayName: "Granted",
          fullSlug: PAGE_SLUG,
        },
        {
          id: "restricted",
          displayName: "Restricted",
          fullSlug: PAGE_SLUG,
          permissionId: RESTRICTED_PERMISSION,
        },
      ]),
    );

    const { memberModel, roleModel } = stubPageAccessModels([CATEGORY_FULL_ID]);
    const member = userFixture({ _id: "dyn-member" });
    const payload = await buildSiteLayoutPayload(
      member,
      memberModel,
      roleModel,
      TENANT_A,
    );
    const node = payload.siteLayoutTree.children.pages?.children[CATEGORY_ID];

    expect(node?.childrenOrders).to.deep.equal(["granted"]);
  });

  it("does not resolve a provider whose category the caller cannot reach", async () => {
    let resolverCalls = 0;
    cleanups.push(
      registerProvider(() => {
        resolverCalls += 1;
        return [
          {
            id: "hidden-project",
            displayName: "Hidden project",
            fullSlug: PAGE_SLUG,
          },
        ];
      }),
    );

    const { memberModel, roleModel } = stubPageAccessModels([]);
    const outsider = userFixture({ _id: "dyn-outsider" });
    const payload = await buildSiteLayoutPayload(
      outsider,
      memberModel,
      roleModel,
      TENANT_A,
    );
    const node = payload.siteLayoutTree.children.pages?.children[CATEGORY_ID];

    expect(resolverCalls).to.equal(0);
    expect(node?.childrenOrders).to.deep.equal([]);
  });

  it("skips an entry whose target page the caller cannot access", async () => {
    const restrictedPage = PageController("dyn-restricted", {
      displayName: "Restricted project",
      category: pagesCategory,
      hidden: true,
    });
    cleanups.push(await registerTestPage(restrictedPage));

    cleanups.push(
      registerProvider(() => [
        {
          id: "restricted-target",
          displayName: "Restricted target",
          fullSlug: "/dyn-restricted",
        },
        {
          id: "open-target",
          displayName: "Open target",
          fullSlug: PAGE_SLUG,
        },
      ]),
    );

    const { memberModel, roleModel } = stubPageAccessModels([CATEGORY_FULL_ID]);
    const member = userFixture({ _id: "dyn-member" });
    const payload = await buildSiteLayoutPayload(
      member,
      memberModel,
      roleModel,
      TENANT_A,
    );
    const node = payload.siteLayoutTree.children.pages?.children[CATEGORY_ID];

    expect(node?.childrenOrders).to.deep.equal(["open-target"]);
  });
});
