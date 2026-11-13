import { ImplementInterface } from "@antelopejs/interface-core";
import {
  internal as pageImplInternal,
  buildSiteLayoutPayload,
} from "../../implementations/dms/page";
import * as permissionsImpl from "../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../implementations/dms/tenant-access";
import {
  type CategoryInfo,
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
} from "./page-access";
import { userFixture } from "./user-fixture";

export const CATEGORY_ID = "dyn-projects";
export const CATEGORY_FULL_ID = `pages.${CATEGORY_ID}`;
export const PAGE_SLUG = "/dyn-project";
export const PARAM_PAGE_SLUG = "/dyn-projects/:projectId/services";
export const TENANT_A = "dyn-tenant-a";
export const TENANT_B = "dyn-tenant-b";
export const OWNER = userFixture({ _id: "dyn-owner", owner: true });
export const RESTRICTED_PERMISSION = "dyn.restricted";
export const DENIED_TENANT = "dyn-denied-tenant";
export const BYPASS_TARGET_ACTION = "pages.dyn-bypass-target.settle";

export const denyingGate = denyingTenantGate("dyn-gate", DENIED_TENANT);

/** A node of the site layout tree, as the page index builds it. */
type SiteLayoutNode = Awaited<
  ReturnType<typeof buildSiteLayoutPayload>
>["siteLayoutTree"];

export async function resolveCategoryNode(
  user: User,
  tenantId: string,
): Promise<SiteLayoutNode | undefined> {
  const { memberModel, roleModel } = stubPageAccessModels([]);
  const payload = await buildSiteLayoutPayload(
    user,
    memberModel,
    roleModel,
    tenantId,
  );
  return payload.siteLayoutTree.children.pages?.children[CATEGORY_ID];
}

export function registerProvider(resolver: DynamicMenuResolver): () => void {
  return RegisterDynamicMenuProvider(CATEGORY_FULL_ID, resolver);
}

let registeredCategory: CategoryInfo | undefined;

export const cleanups: Array<() => void> = [];
const suiteCleanups: Array<() => void> = [];

export function projectsCategory(): CategoryInfo {
  if (!registeredCategory) throw new Error("registerMenuFixtures has not run");
  return registeredCategory;
}

export async function registerMenuFixtures() {
  ImplementInterface(permissionsInterface, permissionsImpl);
  ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
  ImplementInterface(tenantAccessInterface, tenantAccessImpl);
  ImplementInterface(pageInterfaceInternal, pageImplInternal);

  const projects = registerTestCategory(CATEGORY_ID, {
    displayName: "Projects",
    category: pagesCategory,
    type: "label",
  });
  registeredCategory = projects.category;
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
}

export function runCleanups() {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
}

export function runSuiteCleanups() {
  for (const cleanup of suiteCleanups.splice(0)) {
    cleanup();
  }
}
