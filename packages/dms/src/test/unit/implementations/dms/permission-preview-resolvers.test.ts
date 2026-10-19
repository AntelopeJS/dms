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
import type {
  PermissionsResolverContext,
  PermissionsResolverInfo,
} from "@antelopejs/interface-dms/permissions-resolver";
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

type OwnerCheck = (
  userId: string,
  context?: PermissionsResolverContext,
) => boolean;

// Whether a resolver counts the user as a workspace owner: one reading the
// preview flag never takes a preview for an owner's set; one ignoring it
// relies on the preview's user id, which belongs to no workspace.
function ownerCheck(readsPreview: boolean): OwnerCheck {
  return (userId, context) =>
    !(readsPreview && context?.preview) && TENANT_OWNER_IDS.has(userId);
}

// Like a subscription plan: an owner is handed all the plan grants, any
// other member keeps the plan's share of their roles. Then the screens kept
// for owners, withheld from everyone else.
function fakeResolvers(readsPreview: boolean): PermissionsResolverInfo[] {
  const isOwner = ownerCheck(readsPreview);
  return [
    {
      id: "prr.plan",
      order: 100,
      resolver: (userId, tenantId, current, context) => {
        if (tenantId !== PLAN_TENANT) return current;
        if (!current.has("*") && isOwner(userId, context)) {
          return new Set(planPermissions);
        }
        return new Set(
          [...current].filter((id) => id === "*" || planPermissions.has(id)),
        );
      },
    },
    {
      id: "prr.owner-only",
      order: 110,
      resolver: (userId, _tenantId, current, context) => {
        if (current.has("*") || isOwner(userId, context)) return current;
        return new Set([...current].filter((id) => id !== BILLING));
      },
    },
  ];
}

const RESOLVER_VARIANTS = [
  { name: "ignoring the preview flag", resolvers: fakeResolvers(false) },
  { name: "reading the preview flag", resolvers: fakeResolvers(true) },
];

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

function registerResolvers(resolvers: PermissionsResolverInfo[]): void {
  for (const info of resolvers) {
    permissionsResolverImpl.internal.RegisterPermissionsResolver.register(info);
  }
}

function unregisterResolvers(resolvers: PermissionsResolverInfo[]): void {
  for (const info of resolvers) {
    permissionsResolverImpl.internal.RegisterPermissionsResolver.unregister(
      info,
    );
  }
}

/** One resolver call: whom it ran for and what it was told. */
interface ResolverCall {
  userId: string;
  context?: PermissionsResolverContext;
}

async function recordResolverCalls(
  run: () => Promise<unknown>,
): Promise<ResolverCall[]> {
  const calls: ResolverCall[] = [];
  const spy: PermissionsResolverInfo = {
    id: "prr.spy",
    order: 0,
    resolver: (userId, _tenantId, current, context) => {
      calls.push({ userId, context });
      return current;
    },
  };
  registerResolvers([spy]);
  try {
    await run();
  } finally {
    unregisterResolvers([spy]);
  }
  return calls;
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
    for (const variant of RESOLVER_VARIANTS) {
      unregisterResolvers(variant.resolvers);
    }
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

    it("hides nothing for a role holding the wildcard", async () => {
      const outcome = await preview(VIEWERS[0], PLAN_TENANT, ["*"]);
      expect(outcome.hiddenEntries).to.be.empty;
      expect(outcome.pageHidden).to.equal(false);
      expect(outcome.hiddenHeaderActions).to.be.empty;
    });
  });

  describe("the resolver context", () => {
    it("tells the resolvers a preview, with the role's set, for no owner", async () => {
      const role = sanitizePreviewPermissions([HOME, INVOICES]);
      const calls = await recordResolverCalls(() =>
        preview(VIEWERS[1], PLAN_TENANT, [HOME, INVOICES]),
      );
      const previews = calls.filter((call) => call.context?.preview);
      // The previewed set, then the set of the preview's header layout.
      expect(previews).to.have.length.of.at.least(2);
      for (const call of previews) {
        expect(TENANT_OWNER_IDS.has(call.userId)).to.equal(false);
        expect(call.userId).to.not.equal(ROLE_MANAGER._id);
        expect([
          ...(call.context?.preview?.rolePermissions ?? []),
        ]).to.have.members([...role]);
      }
    });

    it("tells the resolvers no preview on the viewer's own set", async () => {
      const calls = await recordResolverCalls(() =>
        preview(VIEWERS[1], PLAN_TENANT, [HOME]),
      );
      const own = calls.filter((call) => call.userId === TENANT_OWNER._id);
      expect(own).to.not.be.empty;
      for (const call of own) expect(call.context).to.deep.equal({});
    });
  });

  for (const variant of RESOLVER_VARIANTS) {
    describe(`with a plan and owner-only screens, resolvers ${variant.name}`, () => {
      beforeEach(() => registerResolvers(variant.resolvers));

      for (const viewer of VIEWERS) {
        describe(`previewed by ${viewer.name}`, () => {
          it("hides what the role lacks in a workspace without a plan", async () => {
            const outcome = await preview(viewer, FREE_TENANT, [HOME]);
            expect(outcome.hiddenEntries).to.include.members([
              INVOICES,
              ROLES,
            ]);
            expect(outcome.pageHidden).to.equal(true);
          });

          it("keeps the role's share of a plan granting more", async () => {
            setPlan(...EVERY_GRANT);
            const outcome = await preview(viewer, PLAN_TENANT, [HOME]);
            expect(outcome.hiddenEntries).to.include.members([
              INVOICES,
              ROLES,
            ]);
            expect(outcome.hiddenEntries).to.not.include(HOME);
            expect(outcome.pageHidden).to.equal(true);
          });

          it("hides the header action the role lacks on a page it opens", async () => {
            setPlan(...EVERY_GRANT);
            const outcome = await preview(viewer, PLAN_TENANT, [
              HOME,
              INVOICES,
            ]);
            expect(outcome.pageHidden).to.equal(false);
            expect(outcome.hiddenHeaderActions).to.deep.equal(["export"]);
          });

          it("hides nothing for a role holding the wildcard", async () => {
            setPlan(...EVERY_GRANT);
            const outcome = await preview(viewer, PLAN_TENANT, ["*"]);
            expect(outcome.hiddenEntries).to.be.empty;
            expect(outcome.pageHidden).to.equal(false);
            expect(outcome.hiddenHeaderActions).to.be.empty;
          });
        });
      }

      // Only a platform owner reaches a page the plan refuses: anyone else is
      // refused it too, and a preview never shows beyond the viewer's access.
      it("withholds what the plan refuses, though the role grants it", async () => {
        setPlan(HOME, ROLES, BILLING);
        const outcome = await preview(VIEWERS[0], PLAN_TENANT, [
          HOME,
          INVOICES,
        ]);
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
  }
});
