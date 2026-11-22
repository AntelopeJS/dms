import { expect } from "chai";
import type { AxiosInstance } from "axios";
import { applyArchiveModeDefaultRules } from "@antelopejs/interface-dms/base/helpers/archive-mode-helpers";
import { serializeRowActions } from "@antelopejs/interface-dms/base/table-view/internal/factory-helpers";
import { z } from "zod";
import {
  type CompiledSpec,
  compileSpec,
  type Json,
  type JsonObject,
  mockupNameSchema,
  parseSpec,
} from "../../../mockup";
import {
  MOCKUP_API as BASE,
  serveMockupRoutes,
} from "../../helpers/mockup-routes";

const DEMO = mockupNameSchema.parse("demo");

const ORDERS = [
  { _id: "o1", customer: "Acme", total: 120 },
  { _id: "o2", customer: "Brightline", total: 480 },
  { _id: "o3", customer: "Corvid", total: 75 },
  { _id: "o4", customer: "Delta", total: 310 },
  { _id: "o5", customer: "Evergreen", total: 220 },
];

const ARCHIVED_ORDERS: JsonObject[] = [
  { _id: "a1", customer: "Acme", isArchived: true },
  { _id: "a2", customer: "Brightline" },
  { _id: "a3", customer: "Corvid", isArchived: false },
];

function tableSpec(options: JsonObject): Json {
  return {
    version: 1,
    pages: [
      {
        id: "orders",
        title: "Orders",
        fixtures: { orders: ORDERS, archived: ARCHIVED_ORDERS },
        tree: [
          {
            type: "TableView",
            options: {
              caption: "Orders",
              fetchUrl: "fixture:orders",
              columns: {
                customer: { name: "Customer", type: "string", order: 1 },
                total: { name: "Total", type: "number", order: 2 },
              },
              ...options,
            },
          },
        ],
      },
    ],
  };
}

function compile(spec: Json): CompiledSpec {
  const read = parseSpec(JSON.stringify(spec));
  if (!read.ok) throw new Error(JSON.stringify(read.issues));
  return compileSpec(DEMO, read.spec);
}

const builtSchema = z
  .object({
    archiveMode: z.boolean().optional(),
    archivedCountLabel: z.string().optional(),
    rowActions: z.record(z.string(), z.unknown()),
  })
  .passthrough();

const builtOf = (compiled: CompiledSpec) =>
  builtSchema.parse(compiled.pages[0].tree[0].options);

/** The row actions the real `TableView` serves a table in archive mode whose edit is on. */
function realArchiveActions() {
  const ruled = applyArchiveModeDefaultRules({ edit: true }, "isArchived");
  const { edit, archive, restore } = serializeRowActions(ruled ?? {});
  return { edit, archive, restore };
}

describe("[unit] a mockup table in archive mode", () => {
  it("serves the mode, the Show archived toggle, and archive, restore and edit ruled on the archived state, as the real TableView does (fails when archiveMode is dropped)", () => {
    const compiled = compile(
      tableSpec({
        archiveMode: true,
        archivedCountLabel: "{count} archived orders",
        rowActions: { edit: true },
      }),
    );
    const built = builtOf(compiled);

    expect(compiled.issues).to.deep.equal([]);
    expect(built.archiveMode).to.equal(true);
    expect(built.archivedCountLabel).to.equal("{count} archived orders");
    expect(built.rowActions).to.deep.include({
      ...realArchiveActions(),
      showArchived: true,
      delete: false,
      duplicate: false,
    });
  });

  it("keeps archive or restore off when the spec writes it off", () => {
    const built = builtOf(
      compile(tableSpec({ archiveMode: true, rowActions: { restore: false } })),
    );

    expect(built.rowActions.restore).to.equal(false);
    expect(built.rowActions.archive).to.deep.include({ isEnabled: true });
  });
});

describe("[unit] a mockup table without archive mode", () => {
  it("draws neither archive nor restore when its rowActions name neither (fails while the schema's defaults turn both on)", () => {
    const compiled = compile(tableSpec({ rowActions: { details: true } }));
    const built = builtOf(compiled);

    expect(compiled.issues).to.deep.equal([]);
    expect(built.archiveMode).to.equal(undefined);
    expect(built.rowActions).to.deep.include({
      archive: false,
      restore: false,
    });
    expect(built.rowActions.showArchived).to.equal(undefined);
  });

  it("reports archive or restore turned on, at its pointer, and draws neither (fails when they reach the table)", () => {
    const compiled = compile(
      tableSpec({ rowActions: { archive: true, restore: { rule: {} } } }),
    );

    expect(compiled.issues).to.deep.equal(
      ["archive", "restore"].map((key) => ({
        path: `/pages/0/tree/0/options/rowActions/${key}`,
        message:
          'archive and restore need archiveMode: set "archiveMode": true',
      })),
    );
    expect(builtOf(compiled).rowActions).to.deep.include({
      archive: false,
      restore: false,
    });
  });

  it("accepts archive or restore written off", () => {
    expect(
      compile(tableSpec({ rowActions: { archive: false } })).issues,
    ).to.deep.equal([]);
  });
});

const rowsSchema = z.object({
  results: z.array(
    z.object({ _id: z.string(), isArchived: z.boolean().optional() }),
  ),
  total: z.number(),
});

describe("[unit] the rows route of a mockup table in archive mode", () => {
  const served = serveMockupRoutes(JSON.stringify(tableSpec({})));
  let owner: AxiosInstance;
  const rows = (key: string) =>
    `${BASE}/desk/pages/orders/fixtures/${key}/rows`;
  const listed = async (url: string) => {
    const page = rowsSchema.parse((await owner.get(url)).data);
    return page.results.map(({ _id, isArchived }) => [_id, isArchived]);
  };

  before(() => {
    ({ owner } = served());
  });

  it("lists one side of the archive toggle, the last quarter of a fixture with no isArchived made archived (fails when showArchived is ignored)", async () => {
    expect(await listed(`${rows("orders")}?showArchived=false`)).to.deep.equal([
      ["o1", false],
      ["o2", false],
      ["o3", false],
    ]);
    expect(await listed(`${rows("orders")}?showArchived=true`)).to.deep.equal([
      ["o4", true],
      ["o5", true],
    ]);
    expect(
      await listed(`${rows("orders")}/list?showArchived=true`),
    ).to.have.length(2);
  });

  it("reads the archived state a fixture writes, a row without one not archived", async () => {
    expect(
      await listed(`${rows("archived")}?showArchived=false`),
    ).to.deep.equal([
      ["a2", undefined],
      ["a3", false],
    ]);
    expect(await listed(`${rows("archived")}?showArchived=true`)).to.deep.equal(
      [["a1", true]],
    );
  });

  it("lists every row as written when the table sends no showArchived", async () => {
    expect(await listed(rows("orders"))).to.deep.equal(
      ORDERS.map(({ _id }) => [_id, undefined]),
    );
  });

  it("answers an archive or a restore as done and keeps nothing, and 404 for another change (fails when a mockup's archive cannot be pressed)", async () => {
    const archived = await owner.put(`${rows("orders")}/archive?ids=o1`, {});
    const restored = await owner.put(`${rows("orders")}/restore?ids=o4`, {});
    const other = await owner.put(
      `${rows("orders")}/erase?ids=o1`,
      {},
      {
        validateStatus: () => true,
      },
    );

    expect([archived.status, restored.status]).to.deep.equal([200, 200]);
    expect(archived.data).to.deep.equal({});
    expect(other.status).to.equal(404);
    expect(await listed(`${rows("orders")}?showArchived=true`)).to.have.length(
      2,
    );
  });
});
