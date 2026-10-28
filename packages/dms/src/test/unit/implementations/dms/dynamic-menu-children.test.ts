import { ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  buildSiteLayoutPayload,
  internal as pageImplInternal,
  resolvePermissionPreviewAccess,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  type DynamicMenuItem,
  PageController,
  internal as pageInterfaceInternal,
  pagesCategory,
  RegisterDynamicMenuProvider,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import {
  registerTestPage,
  stubPageAccessModels,
} from "../../../helpers/page-access";

const TENANT = "nested-menu-tenant";
// SAFETY: Menu access reads only the user's id and optional owner flag.
const MEMBER = { _id: "nested-menu-member" } as User;
// SAFETY: Menu access reads only the user's id and owner flag.
const OWNER = { _id: "nested-menu-owner", owner: true } as User;
const PUBLIC_SLUG = "/nested-menu-public";
const PRIVATE_SLUG = "/nested-menu-private";
const PRIVATE_FULL_ID = "pages.nested-menu-private";
const CHILD_PERMISSION = "nested-menu.allowed";

function entry(
  id: string,
  overrides: Partial<DynamicMenuItem> = {},
): DynamicMenuItem {
  return { id, displayName: id, fullSlug: PUBLIC_SLUG, ...overrides };
}

async function readMenu() {
  const { memberModel, roleModel } = stubPageAccessModels([
    pagesCategory.fullId,
    CHILD_PERMISSION,
  ]);
  const payload = await buildSiteLayoutPayload(
    MEMBER,
    memberModel,
    roleModel,
    TENANT,
  );
  return payload.siteLayoutTree.children.pages?.children;
}

describe("[unit] dynamic menu children", () => {
  const suiteCleanups: Array<() => void> = [];
  const cleanups: Array<() => void> = [];

  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    for (const [id, publicAccess] of [
      ["nested-menu-public", true],
      ["nested-menu-private", false],
    ] as const) {
      suiteCleanups.push(
        await registerTestPage(
          PageController(id, {
            displayName: id,
            category: pagesCategory,
            hidden: true,
            publicAccess,
          }),
        ),
      );
    }
  });

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  after(() => {
    for (const cleanup of suiteCleanups.splice(0)) cleanup();
  });

  function provide(items: DynamicMenuItem[]): void {
    cleanups.push(
      RegisterDynamicMenuProvider(pagesCategory.fullId, () => items),
    );
  }

  it("admits children on their own target and permission, dropping refused subtrees", async () => {
    provide([
      entry("parent", {
        children: [
          entry("allowed", { permissionId: CHILD_PERMISSION }),
          entry("unreachable", {
            fullSlug: PRIVATE_SLUG,
            children: [entry("orphan")],
          }),
          entry("unregistered", { fullSlug: "/nested-menu-missing" }),
          entry("forbidden", {
            permissionId: "nested-menu.denied",
            children: [entry("orphan")],
          }),
        ],
      }),
      entry("refused-parent", {
        fullSlug: PRIVATE_SLUG,
        children: [entry("orphan")],
      }),
    ]);

    const children = await readMenu();
    expect(children?.parent?.childrenOrders).to.deep.equal(["allowed"]);
    expect(children?.parent?.children.allowed?.hasAccess).to.equal(true);
    expect(children?.["refused-parent"]).to.equal(undefined);
  });

  it("keys and orders siblings, preserves the first duplicate and qualifies every fullId", async () => {
    provide([
      entry("project", {
        children: [
          entry("late", { order: 20 }),
          entry("shared", {
            displayName: "First",
            order: 4,
            children: [entry("leaf")],
          }),
          entry("shared", { displayName: "Second", order: 1 }),
          entry("early", { order: -2, children: [entry("leaf")] }),
        ],
      }),
    ]);

    const project = (await readMenu())?.project;
    expect(project?.fullId).to.equal("pages.project");
    expect(project?.childrenOrders).to.deep.equal(["early", "shared", "late"]);
    expect(project?.children.shared?.displayName).to.equal("First");
    expect(project?.children.shared?.fullId).to.equal("pages.project.shared");
    expect(project?.children.shared?.children.leaf?.fullId).to.equal(
      "pages.project.shared.leaf",
    );
    expect(project?.children.early?.children.leaf?.fullId).to.equal(
      "pages.project.early.leaf",
    );
  });

  it("keeps level three as a leaf and drops level four rather than flattening it", async () => {
    provide([
      entry("one", {
        children: [
          entry("two", {
            children: [entry("three", { children: [entry("four")] })],
          }),
        ],
      }),
    ]);

    const three = (await readMenu())?.one?.children.two?.children.three;
    expect(three?.fullId).to.equal("pages.one.two.three");
    expect(three?.children).to.deep.equal({});
    expect(three?.childrenOrders).to.deep.equal([]);
  });

  it("locks nested entries in role previews when their own target or permission is lost", async () => {
    provide([
      entry("preview-parent", {
        children: [
          entry("target", {
            fullSlug: PRIVATE_SLUG,
            children: [entry("orphan")],
          }),
          entry("permission", { permissionId: CHILD_PERMISSION }),
          entry("kept", { children: [entry("grandchild")] }),
        ],
      }),
    ]);
    const { memberModel, roleModel } = stubPageAccessModels([]);
    const access = await resolvePermissionPreviewAccess({
      user: OWNER,
      memberModel,
      roleModel,
      tenantId: TENANT,
      previewPermissions: new Set([pagesCategory.fullId]),
    });

    expect(access.hiddenEntries).to.include.members([
      "pages.preview-parent.target",
      "pages.preview-parent.target.orphan",
      "pages.preview-parent.permission",
    ]);
    expect(access.hiddenEntries).to.not.include("pages.preview-parent.kept");
    expect(access.hiddenEntries).to.not.include(
      "pages.preview-parent.kept.grandchild",
    );
  });

  it("marks nested entries partial when their hidden target page loses content", async () => {
    provide([
      entry("preview-parent", {
        children: [
          entry("middle", {
            children: [entry("partial", { fullSlug: PRIVATE_SLUG })],
          }),
        ],
      }),
    ]);
    const { memberModel, roleModel } = stubPageAccessModels([]);
    const access = await resolvePermissionPreviewAccess({
      user: OWNER,
      memberModel,
      roleModel,
      tenantId: TENANT,
      previewPermissions: new Set(withPermissionAncestors([PRIVATE_FULL_ID])),
      pageLoses: async (page) => page.fullId === PRIVATE_FULL_ID,
    });

    expect(access.partialEntries).to.include.members([
      "pages.preview-parent",
      "pages.preview-parent.middle",
      "pages.preview-parent.middle.partial",
    ]);
    expect(access.hiddenEntries).to.not.include(
      "pages.preview-parent.middle.partial",
    );
  });
});
