import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "chai";
import {
  compileSpec,
  type Json,
  type JsonObject,
  type MockupIssue,
  mockupNameSchema,
  parseSpec,
  writeSpec,
} from "../../../mockup";

const NAME = mockupNameSchema.parse("crm-desk");

const ORDERS = [
  { _id: "o1", customer: "Acme", paid: true },
  { _id: "o2", customer: "Brightline", paid: false },
];

const WRITING_TABLE: JsonObject = {
  type: "TableView",
  options: {
    caption: "Orders",
    fetchUrl: "fixture:orders",
    columns: {
      customer: { name: "Customer", type: "string" },
      paid: { name: "Paid", type: "boolean" },
    },
    archiveMode: true,
    kanban: { groupByField: "paid", draggable: true },
    rowActions: {
      add: true,
      edit: { rule: { field: "paid", equals: false } },
      duplicate: true,
      delete: true,
      archive: true,
      restore: true,
      details: true,
    },
  },
};

const READING_TABLE: JsonObject = {
  type: "TableView",
  options: {
    caption: "Orders",
    fetchUrl: "fixture:orders",
    columns: {
      customer: { name: "Customer", type: "string" },
      paid: { name: "Paid", type: "boolean" },
    },
    kanban: { groupByField: "paid", draggable: false },
    rowActions: { details: true, edit: false, delete: { isEnabled: false } },
  },
};

const form = (mode: string): JsonObject => ({
  type: "ResourceForm",
  options: {
    mode,
    fetchUrl: "fixture:order",
    fields: [{ id: "customer", label: "Customer", type: "string" }],
  },
});

function specOf(tree: JsonObject[], data?: JsonObject): JsonObject {
  return {
    version: 1,
    ...(data && { data }),
    pages: [
      {
        id: "orders",
        title: "Orders",
        fixtures: { orders: ORDERS, order: ORDERS[0] },
        tree,
      },
    ],
  };
}

function issuesOf(spec: Json): MockupIssue[] {
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(NAME, read.spec).issues;
}

const READ_ONLY =
  'writes rows, and the connection "crm" is read-only (data.access is "read")';
const TABLE_FIX =
  "leave it out, as a table over it only lists rows and opens their details";

const issue = (at: string, option: string, fix = TABLE_FIX) => ({
  path: `/pages/0/tree/${at}`,
  message: `${option} ${READ_ONLY}: ${fix}`,
});

describe("[unit] a mockup over a read-only connection", () => {
  it("reports every option of a table or a form that writes rows, at its pointer and naming the connection, and nothing that only reads (fails when a write is drawn on a read-only connection)", () => {
    const issues = issuesOf(
      specOf(
        [WRITING_TABLE, READING_TABLE, form("edit"), form("new"), form("view")],
        { connection: "crm", access: "read" },
      ),
    );

    expect(issues).to.deep.equal([
      ...["add", "edit", "duplicate", "delete", "archive", "restore"].map(
        (action) =>
          issue(`0/options/rowActions/${action}`, `rowActions.${action}`),
      ),
      issue("0/options/archiveMode", "archiveMode"),
      issue(
        "0/options/kanban/draggable",
        "kanban.draggable",
        "leave it out, so the board's cards stay where they are",
      ),
      ...["edit", "new"].map((mode, index) =>
        issue(
          `${index + 2}/options/mode`,
          `mode "${mode}"`,
          'set mode to "view", so the form shows the row read-only',
        ),
      ),
    ]);
  });

  it("reads a connection whose access is left out as read-only, as dms-database does", () => {
    expect(
      issuesOf(specOf([form("edit")], { connection: "crm" })),
    ).to.have.length(1);
  });

  it("leaves a read-write connection, and a spec with no data, unrestricted", () => {
    expect(
      issuesOf(
        specOf([WRITING_TABLE, form("edit")], {
          connection: "crm",
          access: "read-write",
        }),
      ),
    ).to.deep.equal([]);
    expect(issuesOf(specOf([WRITING_TABLE, form("edit")]))).to.deep.equal([]);
  });

  it("takes only the access values dms-database stores, and a connection id", () => {
    const refused: JsonObject[] = [
      { connection: "crm", access: "write" },
      { connection: "", access: "read" },
      { access: "read" },
      { connection: "crm", access: "read", mode: "strict" },
    ];
    for (const data of refused) {
      expect(
        parseSpec(JSON.stringify(specOf([], data))).ok,
        JSON.stringify(data),
      ).to.equal(false);
    }
  });

  it("refuses a write of a spec that writes rows of a read-only connection, listing the issue the viewer shows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dms-data-access-"));
    const data = { connection: "crm", access: "read" };
    try {
      const refused = await writeSpec(dir, NAME, specOf([form("edit")], data), {
        by: "you",
      });
      const accepted = await writeSpec(
        dir,
        NAME,
        specOf([form("view")], data),
        { by: "you" },
      );

      expect(refused.ok ? [] : refused.errors).to.deep.equal([
        issue(
          "0/options/mode",
          'mode "edit"',
          'set mode to "view", so the form shows the row read-only',
        ),
      ]);
      expect(accepted.ok).to.equal(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
