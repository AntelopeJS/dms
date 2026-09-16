import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  buildPagePayload,
  internal as pageImplInternal,
  buildSiteLayoutPayload,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  PageController,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const TENANT = "redaction-tenant";
const SECRET_SLUG = "/redaction-secret";
const SECRET_FULL_ID = "pages.redaction-secret";
const SECRET_NAME = "Quarterly layoffs";
const SECRET_DESCRIPTION = "Who goes and when";
const DYNAMIC_SLUG = "/redaction-dynamic/:id/view";
const DYNAMIC_PATH = "/redaction-dynamic/record-1/view";
const DYNAMIC_FULL_ID = "pages.redaction-dynamic";

interface PageAccessScenario {
  name: string;
  user: User | undefined;
  permissions: string[];
  hasAccess: boolean;
}

const PAGE_ACCESS_SCENARIOS: PageAccessScenario[] = [
  { name: "anonymous", user: undefined, permissions: [], hasAccess: false },
  {
    name: "denied role",
    user: { _id: "redaction-member" } as User,
    permissions: [],
    hasAccess: false,
  },
  {
    name: "authorized role",
    user: { _id: "redaction-member" } as User,
    permissions: [SECRET_FULL_ID, DYNAMIC_FULL_ID],
    hasAccess: true,
  },
];

async function pageEntry(grantedPermissions: string[]) {
  const { memberModel, roleModel } = stubPageAccessModels(grantedPermissions);
  const payload = await buildSiteLayoutPayload(
    { _id: "redaction-member" } as User,
    memberModel,
    roleModel,
    TENANT,
  );
  return payload.siteLayout.pages[SECRET_SLUG];
}

describe("[unit] implementations/dms/page — inaccessible surfaces are redacted", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);

    cleanups.push(
      await registerTestPage(
        PageController("redaction-secret", {
          displayName: SECRET_NAME,
          description: SECRET_DESCRIPTION,
          icon: "i-ph-eye-slash",
          category: pagesCategory,
        }),
      ),
    );
    cleanups.push(
      await registerTestPage(
        PageController("redaction-dynamic", {
          displayName: "Dynamic fixture",
          category: pagesCategory,
          urlSlug: "redaction-dynamic/:id/view",
        }),
      ),
    );
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it("keeps what the caller may reach untouched", async () => {
    const entry = await pageEntry([SECRET_FULL_ID]);

    expect(entry?.hasAccess).to.equal(true);
    expect(entry?.displayName).to.equal(SECRET_NAME);
    expect(entry?.description).to.equal(SECRET_DESCRIPTION);
  });

  it("combines resolved route, shared data and page layout", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([SECRET_FULL_ID]);
    const payload = await buildPagePayload(
      SECRET_SLUG,
      { _id: "redaction-member" } as User,
      memberModel,
      roleModel,
      TENANT,
    );

    expect(payload.route.fullSlug).to.equal(SECRET_SLUG);
    expect(payload.route.hasAccess).to.equal(true);
    expect(payload.shared.siteLayout.pages[SECRET_SLUG]).to.deep.equal(
      payload.route,
    );
    expect(payload.layout).to.be.an("object");
  });

  it("omits shared navigation data from lightweight page responses", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([SECRET_FULL_ID]);
    const payload = await buildPagePayload(
      SECRET_SLUG,
      { _id: "redaction-member" } as User,
      memberModel,
      roleModel,
      TENANT,
      false,
    );

    expect(payload.route.hasAccess).to.equal(true);
    expect(payload.shared).to.equal(undefined);
    expect(payload.layout).to.be.an("object");
  });

  for (const scenario of PAGE_ACCESS_SCENARIOS) {
    for (const path of [
      SECRET_SLUG,
      `${SECRET_SLUG}/`,
      DYNAMIC_PATH,
      `${DYNAMIC_PATH}/`,
    ]) {
      it(`preserves lightweight access and redaction for ${scenario.name} at ${path}`, async () => {
        const { memberModel, roleModel } = stubPageAccessModels(
          scenario.permissions,
        );
        const [full, lightweight] = await Promise.all(
          [true, false].map((includeShared) =>
            buildPagePayload(
              path,
              scenario.user,
              memberModel,
              roleModel,
              TENANT,
              includeShared,
            ),
          ),
        );

        expect(lightweight.route.hasAccess).to.equal(scenario.hasAccess);
        expect(lightweight.route).to.deep.equal(full.route);
        expect(lightweight.layout).to.deep.equal(full.layout);
        expect(lightweight).not.to.have.property("shared");
        if (scenario.hasAccess) return;
        expect(lightweight.route.displayName).to.equal("");
        expect(lightweight.route.description).to.equal(undefined);
        expect(lightweight.route.icon).to.equal(undefined);
        expect(lightweight.route.permission).to.equal(undefined);
      });
    }
  }

  it("resolves a concrete dynamic path against its registered pattern", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([DYNAMIC_FULL_ID]);
    const payload = await buildPagePayload(
      DYNAMIC_PATH,
      { _id: "redaction-member" } as User,
      memberModel,
      roleModel,
      TENANT,
    );

    expect(payload.route.fullSlug).to.equal(DYNAMIC_SLUG);
    expect(payload.route.hasAccess).to.equal(true);
    expect(payload.layout).to.be.an("object");
  });

  it("strips name, description and icon of what it may not", async () => {
    const entry = await pageEntry([]);

    expect(entry?.hasAccess).to.equal(false);
    expect(entry?.displayName).to.equal("");
    expect(entry?.description).to.equal(undefined);
    expect(entry?.icon).to.equal(undefined);
  });

  // The browser matches the slug to tell a 403 from a 404 and to send a
  // signed-out visitor to the auth screens: the entry has to stay addressable.
  it("keeps the structural fields so routing still works", async () => {
    const entry = await pageEntry([]);

    expect(entry?.fullId).to.equal(SECRET_FULL_ID);
    expect(entry?.fullSlug).to.equal(SECRET_SLUG);
  });

  it("redacts the navigation tree the same way", async () => {
    const { memberModel, roleModel } = stubPageAccessModels([]);
    const payload = await buildSiteLayoutPayload(
      { _id: "redaction-member" } as User,
      memberModel,
      roleModel,
      TENANT,
    );
    const node =
      payload.siteLayoutTree.children.pages?.children["redaction-secret"];

    expect(node?.hasAccess).to.equal(false);
    expect(node?.displayName).to.equal("");
    expect(node?.description).to.equal(undefined);
  });
});
