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
  type DynamicMenuItem,
  type DynamicMenuResolver,
  PageController,
  internal as pageInterfaceInternal,
  pagesCategory,
  RegisterDynamicMenuProvider,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  denyingTenantGate,
  registerTestCategory,
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const CATEGORY_ID = "dyn-projects";
const CATEGORY_FULL_ID = `pages.${CATEGORY_ID}`;
const PAGE_SLUG = "/dyn-project";
const PARAM_PAGE_SLUG = "/dyn-projects/:projectId/services";
const TENANT_A = "dyn-tenant-a";
const TENANT_B = "dyn-tenant-b";
const OWNER = { _id: "dyn-owner", owner: true } as User;
const RESTRICTED_PERMISSION = "dyn.restricted";
const DENIED_TENANT = "dyn-denied-tenant";
const BYPASS_TARGET_ACTION = "pages.dyn-bypass-target.settle";

const denyingGate = denyingTenantGate("dyn-gate", DENIED_TENANT);

async function resolveCategoryNode(user: User, tenantId: string) {
  const { memberModel, roleModel } = stubPageAccessModels([]);
  const payload = await buildSiteLayoutPayload(
    user,
    memberModel,
    roleModel,
    tenantId,
  );
  return payload.siteLayoutTree.children.pages?.children[CATEGORY_ID];
}

function registerProvider(resolver: DynamicMenuResolver): () => void {
  return RegisterDynamicMenuProvider(CATEGORY_FULL_ID, resolver);
}

describe("[unit] implementations/dms/page — dynamic menu providers", () => {
  const cleanups: Array<() => void> = [];
  const suiteCleanups: Array<() => void> = [];
  let projectsCategory: CategoryInfo;

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    const projects = registerTestCategory(CATEGORY_ID, {
      displayName: "Projects",
      category: pagesCategory,
      type: "label",
    });
    projectsCategory = projects.category;
    suiteCleanups.push(projects.cleanup);

    suiteCleanups.push(
      await registerTestPage(
        PageController("dyn-project", {
          displayName: "Project",
          category: pagesCategory,
          hidden: true,
          publicAccess: true,
        }),
      ),
    );

    suiteCleanups.push(
      await registerTestPage(
        PageController("dyn-project-services", {
          displayName: "Project services",
          category: pagesCategory,
          urlSlug: "dyn-projects/:projectId/services",
          hidden: true,
          publicAccess: true,
        }),
      ),
    );
  });

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  after(() => {
    for (const cleanup of suiteCleanups.splice(0)) {
      cleanup();
    }
  });

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
      category: projectsCategory,
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
      category: projectsCategory,
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
    const member = { _id: "dyn-member" } as User;
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
    const outsider = { _id: "dyn-outsider" } as User;
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
    const member = { _id: "dyn-member" } as User;
    const payload = await buildSiteLayoutPayload(
      member,
      memberModel,
      roleModel,
      TENANT_A,
    );
    const node = payload.siteLayoutTree.children.pages?.children[CATEGORY_ID];

    expect(node?.childrenOrders).to.deep.equal(["open-target"]);
  });

  it("keeps the caller's real permissions under a gate-bypassing category", async () => {
    const bypassCategory = registerTestCategory("dyn-bypass", {
      displayName: "Recovery",
      category: pagesCategory,
      type: "label",
      bypassTenantAccessGate: true,
    });
    cleanups.push(bypassCategory.cleanup);
    const bypassPage = PageController("dyn-bypass-target", {
      displayName: "Recovery target",
      category: pagesCategory,
      hidden: true,
      bypassTenantAccessGate: true,
    });
    cleanups.push(await registerTestPage(bypassPage));

    let resolverPermissions: Set<string> | undefined;
    cleanups.push(
      RegisterDynamicMenuProvider(
        bypassCategory.category.fullId,
        (_user, _t, perms) => {
          resolverPermissions = perms;
          return [
            {
              id: "recover",
              displayName: "Recover",
              fullSlug: "/dyn-bypass-target",
              permissionId: BYPASS_TARGET_ACTION,
            },
          ];
        },
      ),
    );

    tenantAccessInterface.RegisterTenantAccessGate(denyingGate);
    cleanups.push(() =>
      tenantAccessInterface.internal.RegisterTenantAccessGate.unregister(
        denyingGate,
      ),
    );

    const { memberModel, roleModel } = stubPageAccessModels([
      bypassCategory.category.fullId,
      "pages.dyn-bypass-target",
      BYPASS_TARGET_ACTION,
      RESTRICTED_PERMISSION,
    ]);
    const member = { _id: "dyn-suspended" } as User;
    const payload = await buildSiteLayoutPayload(
      member,
      memberModel,
      roleModel,
      DENIED_TENANT,
    );
    const node = payload.siteLayoutTree.children.pages?.children["dyn-bypass"];

    // The resolver sees the caller's real set under a flagged category, and the
    // entry survives because its permission belongs to the flagged page.
    expect(resolverPermissions?.has(RESTRICTED_PERMISSION)).to.equal(true);
    expect(node?.childrenOrders).to.deep.equal(["recover"]);
  });

  it("hides an entry the caller's permission set cannot explain", async () => {
    // The category survives the gate on its own (public) and the entry targets a
    // page flagged bypassTenantAccessGate, but its permission belongs to no
    // flagged surface: the client never receives it, so the entry stays out.
    const publicCategory = registerTestCategory("dyn-public", {
      displayName: "Recovery links",
      category: pagesCategory,
      type: "label",
      publicAccess: true,
    });
    cleanups.push(publicCategory.cleanup);
    const bypassPage = PageController("dyn-public-target", {
      displayName: "Recovery target",
      category: pagesCategory,
      hidden: true,
      bypassTenantAccessGate: true,
    });
    cleanups.push(await registerTestPage(bypassPage));

    cleanups.push(
      RegisterDynamicMenuProvider(publicCategory.category.fullId, () => [
        {
          id: "settle",
          displayName: "Settle invoice",
          fullSlug: "/dyn-public-target",
          permissionId: RESTRICTED_PERMISSION,
        },
      ]),
    );

    tenantAccessInterface.RegisterTenantAccessGate(denyingGate);
    cleanups.push(() =>
      tenantAccessInterface.internal.RegisterTenantAccessGate.unregister(
        denyingGate,
      ),
    );

    const { memberModel, roleModel } = stubPageAccessModels([
      "pages.dyn-public-target",
      RESTRICTED_PERMISSION,
    ]);
    const member = { _id: "dyn-suspended-member" } as User;
    const payload = await buildSiteLayoutPayload(
      member,
      memberModel,
      roleModel,
      DENIED_TENANT,
    );
    const node = payload.siteLayoutTree.children.pages?.children["dyn-public"];

    expect(node?.childrenOrders).to.deep.equal([]);
  });

  it("keeps an entry whose permission belongs to the flagged page", async () => {
    const publicCategory = registerTestCategory("dyn-public-kept", {
      displayName: "Recovery links",
      category: pagesCategory,
      type: "label",
      publicAccess: true,
    });
    cleanups.push(publicCategory.cleanup);
    const bypassPage = PageController("dyn-kept-target", {
      displayName: "Recovery target",
      category: pagesCategory,
      hidden: true,
      bypassTenantAccessGate: true,
    });
    cleanups.push(await registerTestPage(bypassPage));
    const settlePermission = "pages.dyn-kept-target.settle";

    cleanups.push(
      RegisterDynamicMenuProvider(publicCategory.category.fullId, () => [
        {
          id: "settle",
          displayName: "Settle invoice",
          fullSlug: "/dyn-kept-target",
          permissionId: settlePermission,
        },
      ]),
    );

    tenantAccessInterface.RegisterTenantAccessGate(denyingGate);
    cleanups.push(() =>
      tenantAccessInterface.internal.RegisterTenantAccessGate.unregister(
        denyingGate,
      ),
    );

    const { memberModel, roleModel } = stubPageAccessModels([
      "pages.dyn-kept-target",
      settlePermission,
    ]);
    const member = { _id: "dyn-suspended-owner" } as User;
    const payload = await buildSiteLayoutPayload(
      member,
      memberModel,
      roleModel,
      DENIED_TENANT,
    );
    const node =
      payload.siteLayoutTree.children.pages?.children["dyn-public-kept"];

    expect(node?.childrenOrders).to.deep.equal(["settle"]);
  });

  it("hides an entry granted only by a defaultGranted permission", async () => {
    // `publicAccess` registers the page permission as defaultGranted, which the
    // server would honour but the browser never receives: such an entry would
    // render with its controls disabled.
    const openPage = PageController("dyn-default-granted", {
      displayName: "Open page",
      category: pagesCategory,
      hidden: true,
      publicAccess: true,
    });
    cleanups.push(await registerTestPage(openPage));

    cleanups.push(
      registerProvider(() => [
        {
          id: "default-granted",
          displayName: "Granted by default",
          fullSlug: PAGE_SLUG,
          permissionId: "pages.dyn-default-granted",
        },
      ]),
    );

    const { memberModel, roleModel } = stubPageAccessModels([CATEGORY_FULL_ID]);
    const member = { _id: "dyn-plain-member" } as User;
    const payload = await buildSiteLayoutPayload(
      member,
      memberModel,
      roleModel,
      TENANT_A,
    );
    const node = payload.siteLayoutTree.children.pages?.children[CATEGORY_ID];

    expect(node?.childrenOrders).to.deep.equal([]);
  });

  it("keeps an entry the owner wildcard covers", async () => {
    cleanups.push(
      registerProvider(() => [
        {
          id: "owner-only",
          displayName: "Owner only",
          fullSlug: PAGE_SLUG,
          permissionId: RESTRICTED_PERMISSION,
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal(["owner-only"]);
  });

  it("skips an entry whose id would alias a nested path", async () => {
    cleanups.push(
      registerProvider(() => [
        {
          id: "team.project",
          displayName: "Dotted id",
          fullSlug: PAGE_SLUG,
        },
        {
          id: "plain",
          displayName: "Plain id",
          fullSlug: PAGE_SLUG,
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal(["plain"]);
  });

  it("skips an entry whose target page is not registered", async () => {
    cleanups.push(
      registerProvider(() => [
        {
          id: "orphan",
          displayName: "Orphan",
          fullSlug: "/does-not-exist",
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal([]);
  });

  it("links an entry to its target page with the route parameters filled", async () => {
    cleanups.push(
      registerProvider(() => [
        {
          id: "acme",
          displayName: "Acme",
          fullSlug: PARAM_PAGE_SLUG,
          params: { projectId: "acme/1" },
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.children.acme?.fullSlug).to.equal(
      "/dyn-projects/acme%2F1/services",
    );
    expect(node?.children.acme).to.not.have.property("params");
  });

  it("skips an entry that does not fill exactly its target's route parameters", async () => {
    cleanups.push(
      registerProvider((): DynamicMenuItem[] => [
        { id: "unfilled", displayName: "Unfilled", fullSlug: PARAM_PAGE_SLUG },
        {
          id: "empty",
          displayName: "Empty",
          fullSlug: PARAM_PAGE_SLUG,
          params: { projectId: "" },
        },
        {
          id: "misnamed",
          displayName: "Misnamed",
          fullSlug: PARAM_PAGE_SLUG,
          params: { project: "acme" },
        },
        {
          id: "extra",
          displayName: "Extra",
          fullSlug: PAGE_SLUG,
          params: { projectId: "acme" },
        },
        {
          id: "filled",
          displayName: "Filled",
          fullSlug: PARAM_PAGE_SLUG,
          params: { projectId: "acme" },
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal(["filled"]);
  });

  it("resolves the rest of the menu when a resolver throws", async () => {
    cleanups.push(
      registerProvider(() => {
        throw new Error("resolver exploded");
      }),
    );
    cleanups.push(
      registerProvider((): DynamicMenuItem[] => [
        {
          id: "survivor",
          displayName: "Survivor",
          fullSlug: PAGE_SLUG,
        },
      ]),
    );

    const node = await resolveCategoryNode(OWNER, TENANT_A);
    expect(node?.childrenOrders).to.deep.equal(["survivor"]);
  });
});
