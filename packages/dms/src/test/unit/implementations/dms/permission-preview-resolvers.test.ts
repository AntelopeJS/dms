import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  internal as pageImplInternal,
  resolvePermissionPreviewAccess,
  resolvePreviewPermissions,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import { sanitizePreviewPermissions } from "../../../../pages/settings/users/role-preview";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import {
  PageController,
  internal as pageInterfaceInternal,
  pagesCategory,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import type { PermissionsResolverInfo } from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import {
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const HOME = "pages.prr-home";
const INVOICES = "pages.prr-invoices";
const INVOICES_EXPORT = `${INVOICES}.export`;
const ROLES = "pages.prr-roles";
// A screen kept for the workspace owners, whatever a role grants.
const BILLING = "pages.prr-billing";
const EVERY_GRANT = [HOME, INVOICES, INVOICES_EXPORT, ROLES, BILLING];

// One workspace without a subscription, one whose plan the test sets.
const FREE_TENANT = "prr-free";
const PLAN_TENANT = "prr-plan";

const PLATFORM_OWNER = { _id: "prr-platform-owner", owner: true } as User;
const TENANT_OWNER = { _id: "prr-tenant-owner" } as User;
// A member who may manage roles, holding every page but the owners' one.
const ROLE_MANAGER = { _id: "prr-role-manager" } as User;
const TENANT_OWNER_IDS = new Set([PLATFORM_OWNER._id, TENANT_OWNER._id]);

let planPermissions = new Set<string>();

// A plan stores its grants like a role, with every id they sit under.
function setPlan(...ids: string[]): void {
  planPermissions = new Set(withPermissionAncestors(ids));
}

// Like a subscription plan: an owner is handed all the plan grants, any
// other member keeps the plan's share of their roles.
const planResolver: PermissionsResolverInfo = {
  id: "prr.plan",
  order: 100,
  resolver: (userId, tenantId, current) => {
    if (tenantId !== PLAN_TENANT) return current;
    if (!current.has("*") && TENANT_OWNER_IDS.has(userId)) {
      return new Set(planPermissions);
    }
    return new Set(
      [...current].filter((id) => id === "*" || planPermissions.has(id)),
    );
  },
};

const ownerOnlyResolver: PermissionsResolverInfo = {
  id: "prr.owner-only",
  order: 110,
  resolver: (userId, _tenantId, current) => {
    if (current.has("*") || TENANT_OWNER_IDS.has(userId)) return current;
    return new Set([...current].filter((id) => id !== BILLING));
  },
};

const RESOLVERS = [planResolver, ownerOnlyResolver];

interface Viewer {
  name: string;
  user: User;
  /** What the viewer's own roles grant. */
  grants: string[];
}

const VIEWERS: Viewer[] = [
  { name: "a platform owner", user: PLATFORM_OWNER, grants: [] },
  { name: "a workspace owner", user: TENANT_OWNER, grants: EVERY_GRANT },
  {
    name: "a member managing roles",
    user: ROLE_MANAGER,
    grants: EVERY_GRANT.filter((id) => id !== BILLING),
  },
];

interface PreviewOutcome {
  hiddenEntries: string[];
  pageHidden: boolean | undefined;
  hiddenHeaderActions: string[];
}

// The preview as the roles route computes it: the role's set resolved for a
// member holding it, compared with what the viewer is served.
async function preview(
  viewer: Viewer,
  tenantId: string,
  rolePermissions: string[],
  path = "/prr-invoices",
): Promise<PreviewOutcome> {
  const { memberModel, roleModel } = stubPageAccessModels(viewer.grants);
  const access = await resolvePermissionPreviewAccess({
    path,
    user: viewer.user,
    memberModel,
    roleModel,
    tenantId,
    previewPermissions: await resolvePreviewPermissions(
      tenantId,
      sanitizePreviewPermissions(rolePermissions),
    ),
  });
  return {
    hiddenEntries: access.hiddenEntries.filter((id) => id.includes(".prr-")),
    pageHidden: access.page?.hiddenInPreview,
    hiddenHeaderActions: access.page?.hiddenHeaderActions ?? [],
  };
}

function registerResolvers(): void {
  for (const info of RESOLVERS) {
    permissionsResolverImpl.internal.RegisterPermissionsResolver.register(info);
  }
}

function unregisterResolvers(): void {
  for (const info of RESOLVERS) {
    permissionsResolverImpl.internal.RegisterPermissionsResolver.unregister(
      info,
    );
  }
}

// The roles screen previewed a role through the viewer's own identity: a
// resolver widening an owner's set (a plan handing its owners all it grants)
// widened the role's too, and an owner saw every page open to it.
describe("[unit] implementations/dms/page — role preview through permission resolvers", () => {
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    cleanups.push(
      await registerTestPage(
        PageController("prr-home", {
          displayName: "Home",
          category: pagesCategory,
        }),
      ),
      await registerTestPage(
        PageController(
          "prr-invoices",
          { displayName: "Invoices", category: pagesCategory },
          DefaultLayout({
            headerActions: [
              {
                id: "export",
                label: "Export",
                target: { type: "page", url: "/prr-invoices/export" },
                permissionId: INVOICES_EXPORT,
              },
            ],
          }),
        ),
      ),
      await registerTestPage(
        PageController("prr-roles", {
          displayName: "Roles",
          category: pagesCategory,
        }),
      ),
      await registerTestPage(
        PageController("prr-billing", {
          displayName: "Billing",
          category: pagesCategory,
        }),
      ),
    );
  });

  afterEach(() => {
    unregisterResolvers();
    planPermissions = new Set();
  });

  after(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  describe("without any resolver", () => {
    it("previews the role's set as is", async () => {
      const resolved = await resolvePreviewPermissions(
        PLAN_TENANT,
        new Set([HOME]),
      );
      expect([...resolved]).to.deep.equal([HOME]);
    });

    it("hides what the role does not grant", async () => {
      const outcome = await preview(VIEWERS[0], PLAN_TENANT, [HOME]);
      expect(outcome.hiddenEntries).to.have.members([INVOICES, ROLES, BILLING]);
      expect(outcome.pageHidden).to.equal(true);
    });

    it("hides nothing for a role granting every page", async () => {
      const outcome = await preview(VIEWERS[0], PLAN_TENANT, EVERY_GRANT);
      expect(outcome.hiddenEntries).to.be.empty;
      expect(outcome.pageHidden).to.equal(false);
      expect(outcome.hiddenHeaderActions).to.be.empty;
    });
  });

  describe("with a plan and owner-only screens", () => {
    beforeEach(registerResolvers);

    it("runs the resolvers for a member who is not an owner", async () => {
      const seen: string[] = [];
      const spy: PermissionsResolverInfo = {
        id: "prr.spy",
        order: 0,
        resolver: (userId, _tenantId, current) => {
          seen.push(userId);
          return current;
        },
      };
      permissionsResolverImpl.internal.RegisterPermissionsResolver.register(
        spy,
      );
      try {
        await preview(VIEWERS[1], PLAN_TENANT, [HOME, INVOICES]);
      } finally {
        permissionsResolverImpl.internal.RegisterPermissionsResolver.unregister(
          spy,
        );
      }
      // The viewer's own set is resolved for the viewer; never the preview's.
      const previewIds = seen.filter((id) => id !== TENANT_OWNER._id);
      expect(previewIds).to.not.be.empty;
      expect(previewIds.some((id) => TENANT_OWNER_IDS.has(id))).to.equal(false);
    });

    for (const viewer of VIEWERS) {
      describe(`previewed by ${viewer.name}`, () => {
        it("hides what the role lacks in a workspace without a plan", async () => {
          const outcome = await preview(viewer, FREE_TENANT, [HOME]);
          expect(outcome.hiddenEntries).to.include.members([INVOICES, ROLES]);
          expect(outcome.pageHidden).to.equal(true);
        });

        it("keeps the role's share of a plan granting more", async () => {
          setPlan(...EVERY_GRANT);
          const outcome = await preview(viewer, PLAN_TENANT, [HOME]);
          expect(outcome.hiddenEntries).to.include.members([INVOICES, ROLES]);
          expect(outcome.hiddenEntries).to.not.include(HOME);
          expect(outcome.pageHidden).to.equal(true);
        });

        it("hides the header action the role lacks on a page it opens", async () => {
          setPlan(...EVERY_GRANT);
          const outcome = await preview(viewer, PLAN_TENANT, [HOME, INVOICES]);
          expect(outcome.pageHidden).to.equal(false);
          expect(outcome.hiddenHeaderActions).to.deep.equal(["export"]);
        });
      });
    }

    // Only a platform owner reaches a page the plan refuses: anyone else is
    // refused it too, and a preview never shows beyond the viewer's access.
    it("withholds what the plan refuses, though the role grants it", async () => {
      setPlan(HOME, ROLES, BILLING);
      const outcome = await preview(VIEWERS[0], PLAN_TENANT, [HOME, INVOICES]);
      expect(outcome.hiddenEntries).to.include(INVOICES);
      expect(outcome.hiddenEntries).to.not.include(HOME);
      expect(outcome.pageHidden).to.equal(true);
    });

    it("hides the owners' screen from a role granting it", async () => {
      setPlan(...EVERY_GRANT);
      for (const viewer of VIEWERS.slice(0, 2)) {
        const outcome = await preview(viewer, PLAN_TENANT, EVERY_GRANT);
        expect(outcome.hiddenEntries).to.deep.equal([BILLING]);
        expect(outcome.pageHidden).to.equal(false);
        expect(outcome.hiddenHeaderActions).to.be.empty;
      }
    });

    it("gives every viewer the same answer for the same role", async () => {
      setPlan(HOME, INVOICES, ROLES, BILLING);
      const outcomes = await Promise.all(
        VIEWERS.map((viewer) =>
          preview(viewer, PLAN_TENANT, [HOME], "/prr-home"),
        ),
      );
      // The member managing roles never reaches the owners' screen, so it
      // cannot lose it; everything else reads the same.
      const comparable = outcomes.map((outcome) =>
        outcome.hiddenEntries.filter((id) => id !== BILLING).sort(),
      );
      expect(comparable[1]).to.deep.equal(comparable[0]);
      expect(comparable[2]).to.deep.equal(comparable[0]);
      expect(comparable[0]).to.deep.equal([INVOICES, ROLES]);
      expect(
        outcomes.every((outcome) => outcome.pageHidden === false),
      ).to.equal(true);
    });
  });
});
