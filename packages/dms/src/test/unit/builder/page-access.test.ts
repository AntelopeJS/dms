import { GetModel } from "@antelopejs/interface-database-decorators";
import type { PermissionTree } from "@antelopejs/interface-dms";
import { RoleModel } from "@antelopejs/interface-dms/db";
import { expect } from "chai";
import {
  ConfigurePage,
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
  SetPageBlocks,
} from "../../../implementations/dms-builder";
import type { BlockNode } from "@antelopejs/interface-dms-builder";
import {
  blockAccess,
  describePageAccess,
  findPageRecord,
  pageAccess,
  type PageRecord,
  type RoleAccess,
} from "../../../implementations/dms-builder/engine";
import { createFixture, destroyFixture, expectOk } from "./harness";

function node(
  id: string,
  title: string,
  children: Record<string, PermissionTree> = {},
  defaultGranted?: boolean,
): PermissionTree {
  return { data: { id, title, defaultGranted }, children };
}

/** The tree the DMS registers for /shop/board: the page, its table, its actions. */
function boardTree(pageGranted?: boolean) {
  return {
    pages: {
      children: {
        shop: node("pages.shop", "Shop", {
          board: node(
            "pages.shop.board",
            "Board",
            {
              tickets: node("pages.shop.board.tickets", "Tickets", {
                export: node("pages.shop.board.tickets.export", "Export"),
                list: node("pages.shop.board.tickets.list", "List", {}, true),
              }),
            },
            pageGranted,
          ),
        }),
      },
    },
  };
}

/** The scan's record of a page the fixture created. */
function recordOf(ref: string): PageRecord {
  const record = findPageRecord(ref);
  if (!record) {
    throw new Error(`No page at ${ref}`);
  }
  return record;
}

const SUPPORT: RoleAccess = {
  id: "r1",
  name: "Support",
  members: 3,
  permissions: ["pages.shop.board"],
};

/**
 * Who reaches a page and its blocks, read the way the DMS decides it: a block's
 * permission is named after where it sits under the page's.
 */
describe("who reaches a page", () => {
  before(async function () {
    this.timeout(120_000);
    createFixture();
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    for (const [name, displayName] of [
      ["board", "Board"],
      ["custom", "Custom"],
      ["ward", "Ward"],
    ] as const) {
      expectOk(
        await CreatePage({ name, displayName, category: "pages.shop" }),
        "CreatePage",
      );
    }
    expectOk(
      await CreateResource({
        name: "ticket",
        fields: [{ name: "title", dataType: { $dataType: "string" } }],
      }),
      "CreateResource",
    );
    const board = expectOk(await GetPageStructure("/shop/board"), "board");
    expectOk(
      await SetPageBlocks(
        "/shop/board",
        {
          blocks: [
            {
              name: "tickets",
              type: "TableView",
              controller: "ticket",
              config: {},
            },
          ],
        },
        { expectedVersion: board.version },
      ),
      "SetPageBlocks board",
    );
    const ward = expectOk(await GetPageStructure("/shop/ward"), "ward");
    expectOk(
      await SetPageBlocks(
        "/shop/ward",
        {
          blocks: [
            {
              name: "tickets",
              type: "TableView",
              controller: "ticket",
              config: {},
            },
          ],
        },
        { expectedVersion: ward.version },
      ),
      "SetPageBlocks ward",
    );
  });

  after(() => destroyFixture());

  readsAPagesBlocksAndDefaults();
  readsThePermissionAPageNames();
});

function readsAPagesBlocksAndDefaults(): void {
  it("names the page's permission after it, and lists its blocks' actions", function () {
    const access = describePageAccess(recordOf("/shop/board"), boardTree(), [
      SUPPORT,
    ]);
    expect(access).to.deep.include({
      mode: "blocks",
      fullId: "pages.shop.board",
      permission: "pages.shop.board",
      roles: [SUPPORT],
    });
    expect(access.actions).to.deep.equal({
      "pages.shop.board.tickets": [
        { id: "pages.shop.board.tickets.export", title: "Export" },
        { id: "pages.shop.board.tickets.list", title: "List" },
      ],
    });
    expect(access.held).to.deep.equal({});
    expect(access.granted).to.deep.equal(["pages.shop.board.tickets.list"]);
  });

  it("tells a block held through a setting from an action, and skips its children", function () {
    const card: BlockNode = {
      path: "card",
      name: "card",
      type: "ChartCard",
      editable: true,
      config: { title: "Sales", chart: { $block: { type: "ChartColumn" } } },
      children: [
        { path: "card/note", name: "note", type: "Text", editable: true },
      ],
    };
    const tree = {
      board: node("board", "Board", {
        card: node("board.card", "Card", {
          chart: node("board.card.chart", "Chart"),
          note: node("board.card.note", "Note"),
          export: node("board.card.export", "Export"),
        }),
      }),
    };
    expect(blockAccess([card], "board", tree)).to.deep.equal({
      actions: { "board.card": [{ id: "board.card.export", title: "Export" }] },
      held: { "board.card": [{ id: "board.card.chart", title: "Chart" }] },
    });
  });

  it("says every member reaches a page granted by default", function () {
    const access = describePageAccess(
      recordOf("/shop/board"),
      boardTree(true),
      null,
    );
    expect(access.mode).to.equal("everyone");
  });

  it("leaves a page the DMS has not registered unmanaged", function () {
    const access = describePageAccess(recordOf("/shop/board"), {}, null);
    expect(access.mode).to.equal("unmanaged");
    expect(access.actions).to.deep.equal({});
  });
}

function readsThePermissionAPageNames(): void {
  for (const name of ["constructor", "toString", "hasOwnProperty", "valueOf"]) {
    it(`leaves a page whose permission is named ${name} unmanaged`, async function () {
      this.timeout(120_000);
      expectOk(
        await ConfigurePage("/shop/ward", {
          permission: { id: name, title: "Ward" },
        }),
        "ConfigurePage",
      );
      const access = describePageAccess(recordOf("/shop/ward"), {}, null);
      expect(access.mode).to.equal("unmanaged");
      expect(access.permission).to.equal(name);
    });
  }

  it("takes the permission a page names over its own", async function () {
    this.timeout(120_000);
    expectOk(
      await ConfigurePage("/shop/custom", {
        permission: { id: "shop.desk", title: "Desk" },
      }),
      "ConfigurePage",
    );
    const access = describePageAccess(
      recordOf("/shop/custom"),
      { shop: { children: { desk: node("shop.desk", "Desk") } } },
      null,
    );
    expect(access.permission).to.equal("shop.desk");
    expect(access.fullId).to.equal("pages.shop.custom");
    expect(access.mode).to.equal("blocks");
  });

  it("answers nothing for a page it does not know, and no roles without a tenant", async function () {
    this.timeout(30_000);
    expect(await pageAccess("/shop/nowhere", undefined)).to.equal(undefined);
    const access = await pageAccess("/shop/board", undefined);
    expect(access?.mode).to.equal("unmanaged");
    expect(access?.roles).to.equal(null);
  });

  it("lists a role whose only grant is * as reaching no page", async function () {
    this.timeout(30_000);
    const tenant = "page-access-stored-wildcard";
    const [wildcardId, supportId] = await GetModel(RoleModel, tenant).insert([
      { name: "Stored *", permissions: ["*"] },
      { name: "Support", permissions: ["pages.shop.board", "pages.other"] },
    ]);
    const access = await pageAccess("/shop/board", tenant);
    expect(access?.roles).to.deep.equal([
      { id: String(wildcardId), name: "Stored *", members: 0, permissions: [] },
      {
        id: String(supportId),
        name: "Support",
        members: 0,
        permissions: ["pages.shop.board"],
      },
    ]);
  });
}
