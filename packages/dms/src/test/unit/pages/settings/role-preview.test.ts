import { expect } from "chai";
import type { ComponentInfoSerialized } from "@antelopejs/interface-dms/component";
import type { PermissionTree } from "@antelopejs/interface-dms/permissions";
import {
  classifyPreviewBlocks,
  collectPreviewLayout,
  countOutOfScope,
  findPermissionNode,
  listPermissionChildren,
  listPreviewPermissionIds,
  losesOnPreviewPage,
  type RolePreviewLayoutNode,
  sanitizePreviewPermissions,
} from "../../../../pages/settings/users/role-preview";

function leaf(id: string, title = id): PermissionTree {
  return { data: { id, title }, children: {} };
}

// sales.orders (page) › table (component with actions) and kpis (grid with a
// `revenue` child component); `sales` itself is not registered.
const TREE: Record<string, PermissionTree> = {
  sales: {
    children: {
      orders: {
        data: { id: "sales.orders", title: "Orders" },
        children: {
          table: {
            data: { id: "sales.orders.table", title: "Orders table" },
            children: {
              list: leaf("sales.orders.table.list", "List"),
              edit: leaf("sales.orders.table.edit", "Edit"),
              delete: leaf("sales.orders.table.delete", "Delete"),
            },
          },
          kpis: {
            data: { id: "sales.orders.kpis", title: "KPIs" },
            children: {
              revenue: {
                data: { id: "sales.orders.kpis.revenue", title: "Revenue" },
                children: {
                  export: leaf("sales.orders.kpis.revenue.export", "Export"),
                },
              },
            },
          },
        },
      },
    },
  },
};

const COMPONENTS: Record<string, ComponentInfoSerialized> = {
  kpis: {
    componentName: "DmsGrid",
    children: [{ id: "revenue", component: { componentName: "DmsKpi" } }],
  },
  table: { componentName: "DmsTableView" },
};

const childrenOf = (id: string) => listPermissionChildren(TREE, id);

function layout(): RolePreviewLayoutNode[] {
  return collectPreviewLayout(COMPONENTS, "sales.orders", childrenOf);
}

const ALL_IDS = new Set(listPreviewPermissionIds(layout()));

function without(...ids: string[]): Set<string> {
  return new Set([...ALL_IDS].filter((id) => !ids.includes(id)));
}

describe("[unit] pages/settings/users/role-preview", () => {
  describe("sanitizePreviewPermissions", () => {
    it("drops the owner wildcard, empty ids and duplicates", () => {
      expect([
        ...sanitizePreviewPermissions(["*", "a", "", "a", "b"]),
      ]).to.deep.equal(["a", "b"]);
    });
  });

  describe("permission tree lookups", () => {
    it("finds a node through unregistered parents", () => {
      expect(findPermissionNode(TREE, "sales.orders.table")?.data?.id).to.equal(
        "sales.orders.table",
      );
      expect(findPermissionNode(TREE, "sales.missing")).to.equal(undefined);
    });

    it("lists only registered direct children", () => {
      expect(childrenOf("sales")).to.deep.equal(["sales.orders"]);
      expect(childrenOf("sales.missing")).to.deep.equal([]);
      expect(childrenOf("sales.orders.table")).to.deep.equal([
        "sales.orders.table.list",
        "sales.orders.table.edit",
        "sales.orders.table.delete",
      ]);
    });
  });

  describe("collectPreviewLayout", () => {
    it("keys blocks by layout path and splits actions from child components", () => {
      const [kpis, table] = layout();
      expect(kpis.path).to.equal("kpis");
      expect(kpis.actionIds).to.deep.equal([]);
      expect(kpis.children[0].path).to.equal("kpis.revenue");
      expect(kpis.children[0].permissionId).to.equal(
        "sales.orders.kpis.revenue",
      );
      expect(kpis.children[0].actionIds).to.deep.equal([
        "sales.orders.kpis.revenue.export",
      ]);
      expect(table.actionIds).to.have.length(3);
    });

    it("lists every id the preview must decide", () => {
      expect([...ALL_IDS]).to.have.members([
        "sales.orders.kpis",
        "sales.orders.kpis.revenue",
        "sales.orders.kpis.revenue.export",
        "sales.orders.table",
        "sales.orders.table.list",
        "sales.orders.table.edit",
        "sales.orders.table.delete",
      ]);
    });
  });

  describe("classifyPreviewBlocks", () => {
    it("changes nothing when the role holds what the viewer holds", () => {
      const blocks = classifyPreviewBlocks(
        layout(),
        { real: ALL_IDS, preview: ALL_IDS },
        false,
      );
      expect(blocks).to.deep.equal({});
    });

    it("hides a withheld block once, without veiling its children again", () => {
      const blocks = classifyPreviewBlocks(
        layout(),
        { real: ALL_IDS, preview: without("sales.orders.kpis") },
        false,
      );
      expect(blocks).to.deep.equal({ kpis: { state: "hidden" } });
    });

    it("hides a child component inside a visible parent", () => {
      const blocks = classifyPreviewBlocks(
        layout(),
        { real: ALL_IDS, preview: without("sales.orders.kpis.revenue") },
        false,
      );
      expect(blocks).to.deep.equal({ "kpis.revenue": { state: "hidden" } });
    });

    it("marks a block read only when every action is withheld", () => {
      const blocks = classifyPreviewBlocks(
        layout(),
        {
          real: ALL_IDS,
          preview: without(
            "sales.orders.table.list",
            "sales.orders.table.edit",
            "sales.orders.table.delete",
          ),
        },
        false,
        (id) => id.split(".").at(-1) ?? id,
      );
      expect(blocks).to.deep.equal({
        table: { state: "readonly", withheld: ["list", "edit", "delete"] },
      });
    });

    it("marks a block read only when only reading actions are left", () => {
      const blocks = classifyPreviewBlocks(
        layout(),
        {
          real: ALL_IDS,
          preview: without(
            "sales.orders.table.edit",
            "sales.orders.table.delete",
          ),
        },
        false,
      );
      expect(blocks).to.deep.equal({
        table: {
          state: "readonly",
          withheld: ["sales.orders.table.edit", "sales.orders.table.delete"],
        },
      });
    });

    it("marks a block limited when only a reading action is withheld", () => {
      const blocks = classifyPreviewBlocks(
        layout(),
        { real: ALL_IDS, preview: without("sales.orders.table.list") },
        false,
      );
      expect(blocks).to.deep.equal({
        table: { state: "limited", withheld: ["sales.orders.table.list"] },
      });
    });

    it("marks a block limited when only some actions are withheld", () => {
      const blocks = classifyPreviewBlocks(
        layout(),
        { real: ALL_IDS, preview: without("sales.orders.table.delete") },
        false,
      );
      expect(blocks).to.deep.equal({
        table: { state: "limited", withheld: ["sales.orders.table.delete"] },
      });
    });

    it("leaves out actions every member holds", () => {
      const universal = new Set(["sales.orders.table.delete"]);
      const blocks = classifyPreviewBlocks(
        layout(),
        {
          real: ALL_IDS,
          preview: without("sales.orders.table.edit"),
          universal,
        },
        false,
      );
      expect(blocks).to.deep.equal({
        table: { state: "readonly", withheld: ["sales.orders.table.edit"] },
      });
    });

    it("ignores actions the viewer does not hold", () => {
      const real = without("sales.orders.table.delete");
      const blocks = classifyPreviewBlocks(
        layout(),
        { real, preview: without("sales.orders.table.delete") },
        false,
      );
      expect(blocks).to.deep.equal({});
    });

    it("hides every top-level block of a page the role cannot open", () => {
      const blocks = classifyPreviewBlocks(
        layout(),
        { real: ALL_IDS, preview: ALL_IDS },
        true,
      );
      expect(blocks).to.deep.equal({
        kpis: { state: "hidden" },
        table: { state: "hidden" },
      });
    });
  });

  describe("losesOnPreviewPage", () => {
    it("keeps a page whole when no block and no header action changes", () => {
      const blocks = classifyPreviewBlocks(
        layout(),
        { real: ALL_IDS, preview: ALL_IDS },
        false,
      );
      expect(losesOnPreviewPage(blocks, [])).to.equal(false);
    });

    it("finds a loss in a read-only block (list and view only)", () => {
      const blocks = classifyPreviewBlocks(
        layout(),
        {
          real: ALL_IDS,
          preview: without(
            "sales.orders.table.edit",
            "sales.orders.table.delete",
          ),
        },
        false,
      );
      expect(losesOnPreviewPage(blocks, [])).to.equal(true);
    });

    it("finds a loss in a hidden nested block or a hidden header action", () => {
      const blocks = classifyPreviewBlocks(
        layout(),
        { real: ALL_IDS, preview: without("sales.orders.kpis.revenue") },
        false,
      );
      expect(losesOnPreviewPage(blocks, [])).to.equal(true);
      expect(losesOnPreviewPage({}, ["export"])).to.equal(true);
    });

    it("finds no loss in actions the viewer does not hold either", () => {
      const real = without("sales.orders.table.delete");
      const blocks = classifyPreviewBlocks(
        layout(),
        { real, preview: real },
        false,
      );
      expect(losesOnPreviewPage(blocks, [])).to.equal(false);
    });
  });

  describe("countOutOfScope", () => {
    it("counts the role's permissions the viewer lacks", () => {
      const real = new Set(["a", "b"]);
      expect(
        countOutOfScope(new Set(["a", "b", "c", "d"]), (id) => real.has(id)),
      ).to.equal(2);
    });
  });
});
