// A page is a class carrying only static component fields — that is the shape the decorator consumes.

import { HTTPResult } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import * as guardsImpl from "../../../../implementations/dms/guards";
import * as pageImpl from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as dmsAuthImpl from "../../../../implementations/dms-auth";
import {
  Component,
  ComponentBuilder,
} from "@antelopejs/interface-dms/component";
import type {
  RoleModel,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import * as pageInterface from "@antelopejs/interface-dms/page";
import {
  GetPageLayoutBySlug,
  GetPermissionId,
  PageController,
  PageMetadata,
  pagesCategory,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import type { TenantTokenInput } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type { FormComponents } from "@antelopejs/interface-dms/base/form";
import { RolesSettingsController } from "../../../../pages/settings/users/roles";

const TENANT = "cc-tenant";
const PAGE_ID = "cc-children";
const PAGE_PERMISSION = `pages.${PAGE_ID}`;
const CARD_PERMISSION = `${PAGE_PERMISSION}.card`;
const PANEL_PERMISSION = `${CARD_PERMISSION}.panel`;
const LEAF_PERMISSION = `${PANEL_PERMISSION}.leaf`;
const TABLE_PERMISSION = `${CARD_PERMISSION}.table`;
const TABLE_EDIT_PERMISSION = `${TABLE_PERMISSION}.edit`;
const HTTP_FORBIDDEN = 403;

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

const pagesCreatedFor: string[] = [];
const filterCalls: string[] = [];

const leaf = new ComponentBuilder<{ tag: string }>("cc-leaf")
  .options({ tag: "leaf" })
  .onCreated(() => pagesCreatedFor.push("leaf"));

const panel = new ComponentBuilder<{ tag: string }>("cc-panel")
  .options({ tag: "panel" })
  .onFilter((_permissions, options, permissionId) => {
    filterCalls.push(permissionId);
    return options;
  })
  .child("leaf", leaf);

// A nested TableView-like component verifies that action permissions still
// descend from the child's positional permission.
const table = new ComponentBuilder<{ tag: string }>("cc-table")
  .options({ tag: "table" })
  .meta({ name: "Nested table" })
  .action("edit", { title: "Edit row" });

const card = new ComponentBuilder<{ tag: string }>("cc-card")
  .options({ tag: "card" })
  .child("panel", panel)
  .child("table", table);

class ChildrenPage extends PageController(PAGE_ID, {
  displayName: "Children page",
  category: pagesCategory,
}) {
  static card = card;
}

interface LayoutChild {
  id: string;
  component: { children?: LayoutChild[] };
}

async function layoutChildren(permissions: string[]): Promise<LayoutChild[]> {
  const slug = GetMetadata(ChildrenPage, PageMetadata).pageInfo?.fullSlug ?? "";
  const handler = GetPageLayoutBySlug(slug);
  expect(handler, `no layout handler registered for ${slug}`).to.not.equal(
    undefined,
  );
  const layout = await (handler as NonNullable<typeof handler>)(
    { _id: "cc-user" } as User,
    {
      getByUser: async () => ({ roleIds: ["cc-role"] }),
    } as unknown as TenantMemberModel,
    {
      getBy: async () => [{ permissions }],
    } as unknown as RoleModel,
    TENANT,
  );
  return (layout.components.card?.children ?? []) as LayoutChild[];
}

async function rejectionOf(promise: Promise<unknown>): Promise<HTTPResult> {
  try {
    await promise;
    throw new Error("Expected promise to reject");
  } catch (error) {
    expect(error).to.be.instanceOf(HTTPResult);
    return error as HTTPResult;
  }
}

function flattenPermissionNodes(
  nodes: FormComponents.PermissionsTreeNode[],
): FormComponents.PermissionsTreeNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenPermissionNodes(node.children ?? []),
  ]);
}

describe("[unit] interfaces/dms/page — children of a page component", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(pageInterface, pageImpl);

    RegisterPage()(ChildrenPage);
    await settle();
  });

  // The registries are process-wide and shared by every suite of the run, so a
  // failing assertion must not leave this page's subtree behind. Disposal is
  // idempotent, which is what lets the release test do it first.
  after(() => {
    const { pageInfo } = GetMetadata(ChildrenPage, PageMetadata);
    if (pageInfo) pageInterface.internal.RegisterPage.unregister(pageInfo);
  });

  it("registers every declared child in the grantable permission tree", async () => {
    expect(
      await permissionsInterface.GetPermission(CARD_PERMISSION),
    ).to.not.equal(undefined);
    expect(
      (await permissionsInterface.GetPermission(PANEL_PERMISSION))?.title,
    ).to.equal("cc-panel");
    expect(
      (await permissionsInterface.GetPermission(LEAF_PERMISSION))?.title,
    ).to.equal("cc-leaf");

    const tree = await permissionsInterface.GetPermissions();
    const cardNode = tree.pages?.children[PAGE_ID]?.children.card;
    expect(cardNode?.children.panel?.data?.id).to.equal(PANEL_PERMISSION);
    expect(cardNode?.children.panel?.children.leaf?.data?.id).to.equal(
      LEAF_PERMISSION,
    );
  });

  it("serializes every child into the data served to the Roles form", async () => {
    const nodes = flattenPermissionNodes(
      await RolesSettingsController.prototype.getPermissionsTree(),
    );
    const panelNode = nodes.find((node) => node.id === PANEL_PERMISSION);

    expect(panelNode?.label).to.equal("cc-panel");
    expect(panelNode?.children?.map((node) => node.id)).to.deep.equal([
      LEAF_PERMISSION,
    ]);
  });

  it("registers a child that carries actions, and its actions", async () => {
    expect(
      (await permissionsInterface.GetPermission(TABLE_PERMISSION))?.title,
    ).to.equal("Nested table");
    expect(
      await permissionsInterface.GetPermission(TABLE_EDIT_PERMISSION),
    ).to.not.equal(undefined);
    expect(table.getAction("edit")?.permissionId).to.equal(
      TABLE_EDIT_PERMISSION,
    );
  });

  it("maps every declared child back to its exact positional id", () => {
    expect(GetPermissionId(card)).to.equal(CARD_PERMISSION);
    expect(GetPermissionId(table)).to.equal(TABLE_PERMISSION);
    expect(GetPermissionId(panel)).to.equal(PANEL_PERMISSION);
    expect(GetPermissionId(leaf)).to.equal(LEAF_PERMISSION);
  });

  it("makes a child-targeted guard require the exact child permission", async () => {
    const previousValidator = dmsAuthImpl.internal.AuthUserValidator;
    Object.defineProperty(dmsAuthImpl.internal, "AuthUserValidator", {
      configurable: true,
      value: async () => ({ _id: "cc-user" }) as User,
    });

    try {
      const token: TenantTokenInput = {
        id: "cc-user",
        rawToken: "cc-token",
        tenantId: "",
      };
      const error = await rejectionOf(
        guardsImpl.internal.AuthUserWithPermissionValidator(panel, token),
      );
      expect(error.getStatus()).to.equal(HTTP_FORBIDDEN);
      expect(error.getBody()).to.equal(
        `Forbidden: missing permission ${PANEL_PERMISSION}`,
      );
    } finally {
      Object.defineProperty(dmsAuthImpl.internal, "AuthUserValidator", {
        configurable: true,
        value: previousValidator,
      });
    }
  });

  it("resolves an exact child target independently of component identity", () => {
    expect(GetPermissionId(card.targetChild("table"))).to.equal(
      TABLE_PERMISSION,
    );
    expect(GetPermissionId(card.targetChild("panel", "leaf"))).to.equal(
      LEAF_PERMISSION,
    );
  });

  it("accepts an exact child target in the permission guard", () => {
    expect(AuthUserWithPermission(card.targetChild("table"))).to.be.a(
      "function",
    );
  });

  it("runs onCreated for nested components too", () => {
    expect(pagesCreatedFor).to.deep.equal(["leaf"]);
  });

  it("withholds children from a role granted only their parent", async () => {
    const children = await layoutChildren([PAGE_PERMISSION, CARD_PERMISSION]);

    expect(children).to.deep.equal([]);
  });

  it("filters each nested position by its exact permission", async () => {
    const panelOnly = await layoutChildren([
      PAGE_PERMISSION,
      CARD_PERMISSION,
      PANEL_PERMISSION,
    ]);
    expect(panelOnly.map((child) => child.id)).to.deep.equal(["panel"]);
    expect(panelOnly[0]?.component.children).to.deep.equal([]);

    const panelAndLeaf = await layoutChildren([
      PAGE_PERMISSION,
      CARD_PERMISSION,
      PANEL_PERMISSION,
      LEAF_PERMISSION,
    ]);
    expect(
      panelAndLeaf[0]?.component.children?.map((child) => child.id),
    ).to.deep.equal(["leaf"]);
  });

  it("holds back an action-bearing child until its own id is granted", async () => {
    const children = await layoutChildren([
      PAGE_PERMISSION,
      CARD_PERMISSION,
      TABLE_PERMISSION,
    ]);

    expect(children.map((child) => child.id)).to.deep.equal(["table"]);
  });

  it("runs a nested component's onFilter under its own permission id", async () => {
    filterCalls.length = 0;
    await layoutChildren([PAGE_PERMISSION, CARD_PERMISSION, PANEL_PERMISSION]);

    expect(filterCalls).to.deep.equal([PANEL_PERMISSION]);
  });

  it("releases everything nested components claimed", async () => {
    const { pageInfo } = GetMetadata(ChildrenPage, PageMetadata);
    if (!pageInfo) throw new Error("pageInfo not initialized");
    pageInterface.internal.RegisterPage.unregister(pageInfo);

    expect(await permissionsInterface.GetPermission(TABLE_PERMISSION)).to.equal(
      undefined,
    );
    expect(
      await permissionsInterface.GetPermission(TABLE_EDIT_PERMISSION),
    ).to.equal(undefined);
    expect(await permissionsInterface.GetPermission(PANEL_PERMISSION)).to.equal(
      undefined,
    );
    expect(await permissionsInterface.GetPermission(LEAF_PERMISSION)).to.equal(
      undefined,
    );
    expect(GetPermissionId(table)).to.equal(undefined);
    expect(GetPermissionId(panel)).to.equal(undefined);
    expect(GetPermissionId(leaf)).to.equal(undefined);
    expect(GetPermissionId(card)).to.equal(undefined);
  });
});

const SHARED_PAGE_ID = "cc-shared";
const SHARED_PAGE_PERMISSION = `pages.${SHARED_PAGE_ID}`;
const SHARED_FIRST_PERMISSION = `${SHARED_PAGE_PERMISSION}.host.first`;
const SHARED_SECOND_PERMISSION = `${SHARED_PAGE_PERMISSION}.host.second`;
const sharedHookCalls: string[] = [];

// One instance, two positions: the hook registers side effects, so running it
// per position would register them twice.
const shared = new ComponentBuilder<{ tag: string }>("cc-shared-child")
  .options({ tag: "shared" })
  .meta({ name: "Shared" })
  .onCreated(() => sharedHookCalls.push("shared"));

const throwing = new ComponentBuilder<{ tag: string }>("cc-throwing")
  .options({ tag: "throwing" })
  .onCreated(() => {
    throw new Error("nested onCreated boom");
  });

// Children hanging off a promised ComponentInfo: serialization emits them, the
// synchronous walk cannot reach them.
const promisedChildren = new Component(
  Promise.resolve({
    componentName: "cc-promised",
    options: { tag: "promised" },
    children: [
      {
        id: "hidden",
        component: new ComponentBuilder<{ tag: string }>("cc-hidden").options({
          tag: "hidden",
        }),
      },
    ],
  }),
  { name: "Promised" },
);

// `collides.edit` would be both this child's id and the parent action's.
const collidingChild = new ComponentBuilder<{ tag: string }>("cc-colliding")
  .options({ tag: "colliding" })
  .meta({ name: "Colliding" })
  .action("rename", { title: "Rename" });

class SharedInstancePage extends PageController(SHARED_PAGE_ID, {
  displayName: "Shared instance page",
  category: pagesCategory,
}) {
  static host = new ComponentBuilder<{ tag: string }>("cc-host")
    .options({ tag: "host" })
    .child("first", shared)
    .child("second", shared)
    .child("throwing", throwing);

  static promised = promisedChildren;

  static collides = new ComponentBuilder<{ tag: string }>("cc-collides")
    .options({ tag: "collides" })
    .action("edit", { title: "Edit" })
    .child("edit", collidingChild);
}

async function sharedLayout(permissions: string[]) {
  const slug =
    GetMetadata(SharedInstancePage, PageMetadata).pageInfo?.fullSlug ?? "";
  const handler = GetPageLayoutBySlug(slug);
  expect(handler, `no layout handler registered for ${slug}`).to.not.equal(
    undefined,
  );
  return (handler as NonNullable<typeof handler>)(
    { _id: "cc-shared-user" } as User,
    {
      getByUser: async () => ({ roleIds: ["cc-role"] }),
    } as unknown as TenantMemberModel,
    {
      getBy: async () => [{ permissions }],
    } as unknown as RoleModel,
    TENANT,
  );
}

describe("[unit] interfaces/dms/page — nested components under stress", () => {
  before(async () => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(pageInterface, pageImpl);

    RegisterPage()(SharedInstancePage);
    await settle();
  });

  after(() => {
    const { pageInfo } = GetMetadata(SharedInstancePage, PageMetadata);
    if (pageInfo) pageInterface.internal.RegisterPage.unregister(pageInfo);
  });

  it("runs the onCreated of a reused instance once", () => {
    expect(sharedHookCalls).to.deep.equal(["shared"]);
  });

  it("gives a reused instance the id of its first position", () => {
    expect(GetPermissionId(shared)).to.equal(SHARED_FIRST_PERMISSION);
  });

  it("registers every position of a reused child instance", async () => {
    expect(
      (await permissionsInterface.GetPermission(SHARED_FIRST_PERMISSION))?.id,
    ).to.equal(SHARED_FIRST_PERMISSION);
    expect(
      (await permissionsInterface.GetPermission(SHARED_SECOND_PERMISSION))?.id,
    ).to.equal(SHARED_SECOND_PERMISSION);
  });

  it("targets either position of a reused child explicitly", () => {
    expect(
      GetPermissionId(SharedInstancePage.host.targetChild("first")),
    ).to.equal(`${SHARED_PAGE_PERMISSION}.host.first`);
    expect(
      GetPermissionId(SharedInstancePage.host.targetChild("second")),
    ).to.equal(`${SHARED_PAGE_PERMISSION}.host.second`);
  });

  it("registers the page despite a nested onCreated that throws", () => {
    const { pageInfo } = GetMetadata(SharedInstancePage, PageMetadata);
    expect(pageInfo?.fullId).to.equal(SHARED_PAGE_PERMISSION);
    expect(GetPageLayoutBySlug(pageInfo?.fullSlug ?? "")).to.not.equal(
      undefined,
    );
  });

  // The action already owns `<parent>.edit`; the child must not claim it, or
  // granting the action would serve the child too.
  it("leaves a child whose id collides with an action unregistered", async () => {
    const collidingId = `${SHARED_PAGE_PERMISSION}.collides.edit`;

    expect(GetPermissionId(collidingChild)).to.equal(undefined);
    expect(
      SharedInstancePage.collides.getAction("edit")?.permissionId,
    ).to.equal(collidingId);
    // The id stayed the action's: its title, not the child's.
    expect(
      (await permissionsInterface.GetPermission(collidingId))?.title,
    ).to.equal("Edit");
  });

  // Holding the action must not serve the child that shares its id.
  it("withholds a colliding child from a role granted the action", async () => {
    const layout = await sharedLayout([
      SHARED_PAGE_PERMISSION,
      `${SHARED_PAGE_PERMISSION}.collides`,
      `${SHARED_PAGE_PERMISSION}.collides.edit`,
    ]);

    expect(layout.components.collides?.children).to.deep.equal([]);
  });

  it("withholds unwalkable children even from a stale exact grant", async () => {
    const layout = await sharedLayout([
      SHARED_PAGE_PERMISSION,
      `${SHARED_PAGE_PERMISSION}.promised`,
      `${SHARED_PAGE_PERMISSION}.promised.hidden`,
    ]);

    expect(layout.components.promised?.children).to.deep.equal([]);
  });

  it("releases every position of a reused child instance", async () => {
    const { pageInfo } = GetMetadata(SharedInstancePage, PageMetadata);
    if (!pageInfo) throw new Error("pageInfo not initialized");
    pageInterface.internal.RegisterPage.unregister(pageInfo);

    expect(
      await permissionsInterface.GetPermission(SHARED_FIRST_PERMISSION),
    ).to.equal(undefined);
    expect(
      await permissionsInterface.GetPermission(SHARED_SECOND_PERMISSION),
    ).to.equal(undefined);
    expect(GetPermissionId(shared)).to.equal(undefined);
  });
});
