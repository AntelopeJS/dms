import { Schema } from "@antelopejs/interface-database";
import {
  BasicDataModel,
  Field,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import type { TreeNode } from "@antelopejs/interface-dms/base/tree";
import {
  TREE_BRANCH_PARAMETER,
  type TreeLevel,
  treeNodes,
} from "@antelopejs/interface-dms/base/tree-source";
import { expect } from "chai";

const SCHEMA = "tree-source-test";
const URL_OF_TREE = "/shop/board/tree/orders";

@RegisterTable("categories", SCHEMA)
class Category extends Table {
  @Field("string") declare name: string;
  @Field("string") declare parent: string;
}
class CategoryModel extends BasicDataModel(Category, "categories") {}

@RegisterTable("customers", SCHEMA)
class Customer extends Table {
  @Field("string") declare name: string;
}
class CustomerModel extends BasicDataModel(Customer, "customers") {}

@RegisterTable("orders", SCHEMA)
class Order extends Table {
  @Field("string") declare customer: string;
  @Field("string") declare status: string;
  @Field("number") declare amount: number;
  @Field("date") declare createdAt: Date;
}
class OrderModel extends BasicDataModel(Order, "orders") {}

let categories: CategoryModel;
let customers: CustomerModel;
let orders: OrderModel;
let alice: string;
let bruno: string;

/** The tree as a reader sees it: each item's name, what it holds under it. */
function shape(nodes: TreeNode[]): unknown[] {
  return nodes.map((node) =>
    node.children ? { [node.label]: shape(node.children) } : node.label,
  );
}

/** The branch a lazy item's address asks for. */
function branchOf(node: TreeNode | undefined): string {
  expect(node?.lazyLoadUrl, `${node?.label} opens`).to.be.a("string");
  const url = new URL(node?.lazyLoadUrl as string, "http://localhost");
  expect(url.pathname).to.equal(URL_OF_TREE);
  return url.searchParams.get(TREE_BRANCH_PARAMETER) as string;
}

const byLabel = (nodes: TreeNode[], label: string): TreeNode | undefined =>
  nodes.find((node) => node.label === label);

describe("[unit] interfaces/dms-base/tree-source", () => {
  before(async () => {
    await RegisterSchema(SCHEMA);
    const schema = Schema.get(SCHEMA);
    if (!schema) throw new Error("Missing test schema");
    const instance = schema.instance();
    categories = new CategoryModel(instance);
    customers = new CustomerModel(instance);
    orders = new OrderModel(instance);

    const [electronics, home] = await categories.insert([
      { name: "Electronics" },
      { name: "Home", parent: "" },
    ]);
    const [phones] = await categories.insert([
      { name: "Phones", parent: electronics },
      { name: "Computers", parent: electronics },
      { name: "Garden", parent: home },
    ]);
    await categories.insert([{ name: "Smartphones", parent: phones }]);

    [alice, bruno] = (await customers.insert([
      { name: "Alice Martin" },
      { name: "Bruno Petit" },
      { name: "Chloé Durand" },
    ])) as [string, string];
    await orders.insert([
      {
        customer: alice,
        status: "paid",
        amount: 120,
        createdAt: new Date("2026-09-12T10:00:00Z"),
      },
      {
        customer: alice,
        status: "paid",
        amount: 80,
        createdAt: new Date("2026-09-18T10:00:00Z"),
      },
      {
        customer: alice,
        status: "paid",
        amount: 45,
        createdAt: new Date("2026-08-03T10:00:00Z"),
      },
      {
        customer: bruno,
        status: "pending",
        amount: 60,
        createdAt: new Date("2026-09-28T10:00:00Z"),
      },
      {
        customer: bruno,
        amount: 10,
        createdAt: new Date("2026-09-30T10:00:00Z"),
      },
      // A date stored as text, as a row written by hand can hold it.
      {
        status: "refunded",
        amount: 30,
        createdAt: "2026-09-24" as unknown as Date,
      },
    ]);
  });

  describe("by columns", () => {
    it("groups the rows by each column in turn, its rows at the end of each branch", async () => {
      const levels: TreeLevel[] = [
        { table: orders.table, by: "status" },
        { table: orders.table, by: "createdAt", every: "month" },
        { table: orders.table, label: ["amount"] },
      ];
      // Read whole, a tree needs no address: no branch is asked for later.
      const tree = await treeNodes({ levels });

      expect(shape(tree)).to.deep.equal([
        {
          "paid (3)": [
            { "August 2026 (1)": ["45"] },
            { "September 2026 (2)": ["80", "120"] },
          ],
        },
        { "pending (1)": [{ "September 2026 (1)": ["60"] }] },
        { "refunded (1)": [{ "None (1)": ["30"] }] },
        { "None (1)": [{ "September 2026 (1)": ["10"] }] },
      ]);
    });

    it("ends on a count when no level lists the rows", async () => {
      const levels: TreeLevel[] = [{ table: orders.table, by: "status" }];
      const tree = await treeNodes({ levels }, { url: URL_OF_TREE });

      expect(shape(tree)).to.deep.equal([
        "paid (3)",
        "pending (1)",
        "refunded (1)",
        "None (1)",
      ]);
      expect(tree.map((node) => node.value)).to.deep.equal([
        "paid",
        "pending",
        "refunded",
        "∅",
      ]);
    });
  });

  describe("by its parent", () => {
    const levels = (): TreeLevel[] => [
      {
        table: categories.table,
        parent: "parent",
        label: ["name"],
        icon: "i-ph-folder-simple",
      },
    ];

    it("nests each row under the one it names, from the rows naming none", async () => {
      const tree = await treeNodes({ levels: levels() }, { url: URL_OF_TREE });

      expect(shape(tree)).to.deep.equal([
        { Electronics: ["Computers", { Phones: ["Smartphones"] }] },
        { Home: ["Garden"] },
      ]);
      expect(tree[0]?.icon).to.equal("i-ph-folder-simple");
    });

    it("answers one branch at a time, only what holds more opening", async () => {
      const top = await treeNodes(
        { levels: levels(), lazy: true },
        { url: URL_OF_TREE },
      );
      expect(shape(top)).to.deep.equal(["Electronics", "Home"]);
      expect(top.every((node) => node.hasChildren)).to.equal(true);

      const branch = await treeNodes(
        { levels: levels(), lazy: true },
        { url: URL_OF_TREE, branch: branchOf(byLabel(top, "Electronics")) },
      );
      expect(shape(branch)).to.deep.equal(["Computers", "Phones"]);
      expect(
        byLabel(branch, "Computers")?.hasChildren,
        "nothing under it",
      ).to.equal(undefined);
      expect(byLabel(branch, "Phones")?.hasChildren).to.equal(true);
    });
  });

  describe("linked tables", () => {
    const levels = (): TreeLevel[] => [
      { table: customers.table, label: ["name"] },
      { table: orders.table, link: "customer", label: ["createdAt", "amount"] },
    ];

    it("lists under each row the rows of the next table linked to it", async () => {
      const tree = await treeNodes({ levels: levels() }, { url: URL_OF_TREE });

      expect(shape(tree)).to.deep.equal([
        {
          "Alice Martin": [
            "Aug 3, 2026 · 45",
            "Sep 12, 2026 · 120",
            "Sep 18, 2026 · 80",
          ],
        },
        { "Bruno Petit": ["Sep 28, 2026 · 60", "Sep 30, 2026 · 10"] },
        "Chloé Durand",
      ]);
    });

    it("opens a row only when the next table links something to it", async () => {
      const top = await treeNodes(
        { levels: levels(), lazy: true },
        { url: URL_OF_TREE },
      );
      expect(top.map((node) => node.hasChildren ?? false)).to.deep.equal([
        true,
        true,
        false,
      ]);

      const branch = await treeNodes(
        { levels: levels(), lazy: true },
        { url: URL_OF_TREE, branch: branchOf(byLabel(top, "Bruno Petit")) },
      );
      expect(shape(branch)).to.deep.equal([
        "Sep 28, 2026 · 60",
        "Sep 30, 2026 · 10",
      ]);
    });
  });

  describe("a branch asked for", () => {
    it("carries the groups it sits in, so the next level stays within them", async () => {
      const levels: TreeLevel[] = [
        { table: orders.table, by: "status" },
        { table: orders.table, by: "createdAt", every: "month" },
        { table: orders.table, label: ["amount"] },
      ];
      const paid = byLabel(
        await treeNodes({ levels, lazy: true }, { url: URL_OF_TREE }),
        "paid (3)",
      );
      const months = await treeNodes(
        { levels, lazy: true },
        { url: URL_OF_TREE, branch: branchOf(paid) },
      );
      expect(shape(months)).to.deep.equal([
        "August 2026 (1)",
        "September 2026 (2)",
      ]);

      const rows = await treeNodes(
        { levels, lazy: true },
        {
          url: URL_OF_TREE,
          branch: branchOf(byLabel(months, "September 2026 (2)")),
        },
      );
      expect(shape(rows)).to.deep.equal(["80", "120"]);
    });

    it("finds the rows holding no date under the period of none", async () => {
      const levels: TreeLevel[] = [
        { table: orders.table, by: "status" },
        { table: orders.table, by: "createdAt", every: "month" },
        { table: orders.table, label: ["amount"] },
      ];
      const ask = (node: TreeNode | undefined) =>
        treeNodes(
          { levels, lazy: true },
          { url: URL_OF_TREE, branch: branchOf(node) },
        );
      const top = await treeNodes({ levels, lazy: true }, { url: URL_OF_TREE });
      const periods = await ask(byLabel(top, "refunded (1)"));
      expect(shape(periods)).to.deep.equal(["None (1)"]);
      expect(shape(await ask(periods[0]))).to.deep.equal(["30"]);
    });

    it("answers nothing for a branch no level holds", async () => {
      const levels: TreeLevel[] = [{ table: customers.table, label: ["name"] }];
      for (const branch of [
        "not json",
        "[]",
        '[7, "x"]',
        '[0, {"$ne": null}]',
        '[0, "x", "y"]',
      ]) {
        expect(
          await treeNodes({ levels, lazy: true }, { url: URL_OF_TREE, branch }),
          branch,
        ).to.deep.equal([]);
      }
    });

    it("answers nothing for a tree read whole, which names no branch", async () => {
      const levels: TreeLevel[] = [{ table: customers.table, label: ["name"] }];
      expect(
        await treeNodes(
          { levels },
          { url: URL_OF_TREE, branch: JSON.stringify([0, alice]) },
        ),
      ).to.deep.equal([]);
    });
  });

  describe("levels no tree can be read from", () => {
    it("are refused with what is wrong", async () => {
      const cases: Array<[TreeLevel[], RegExp]> = [
        [[], /at least one level/],
        [
          [
            { table: customers.table, label: ["name"] },
            { table: orders.table, by: "status" },
          ],
          /grouping levels come first/,
        ],
        [
          [
            { table: customers.table, label: ["name"] },
            { table: orders.table, label: ["amount"] },
          ],
          /`link`/,
        ],
      ];
      const refusal = async (run: () => Promise<unknown>): Promise<Error> => {
        try {
          await run();
        } catch (caught) {
          return caught as Error;
        }
        throw new Error("expected the levels to be refused");
      };
      for (const [levels, message] of cases) {
        const error = await refusal(() =>
          treeNodes({ levels }, { url: URL_OF_TREE }),
        );
        expect(error.message, String(message)).to.match(message);
      }
      // Read lazily, it has to say where each branch is asked for.
      const lazy = await refusal(() =>
        treeNodes({
          levels: [{ table: customers.table, label: ["name"] }],
          lazy: true,
        }),
      );
      expect(lazy.message).to.match(/`url`/);
    });
  });
});
