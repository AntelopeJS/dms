import { Controller } from "@antelopejs/interface-api";
import { DataController } from "@antelopejs/interface-data-api";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import {
  Access,
  AccessMode,
  Computed,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Schema } from "@antelopejs/interface-database";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterSchema,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { Exported } from "@antelopejs/interface-dms/base/table-view";
import { expect } from "chai";
import { z } from "zod";
import {
  EXPORT_BATCH_SIZE,
  generateTableViewExport,
} from "../../../../implementations/dms-base/table-view";
import type { ExportWriter } from "../../../../utils";
import { userFixture } from "../../../helpers/user-fixture";
import { requestContextFixture } from "../../../helpers/request-context";

const SCHEMA = "export-batching-test";
const TABLE = "invoices";
const USER = userFixture({ _id: "export-batching-user" });
const ctx = requestContextFixture(new URL("http://localhost/export"));

const ROW_COUNT = EXPORT_BATCH_SIZE * 2 + Math.floor(EXPORT_BATCH_SIZE / 2);

@RegisterTable(TABLE, SCHEMA)
class Invoice extends Table {
  @Field("number")
  declare position: number;
}
class InvoiceModel extends BasicDataModel(Invoice, TABLE) {}

class InvoiceAPI extends DataController(
  Invoice,
  {},
  Controller("/export-batching-test"),
) {
  @ModelReference()
  @Model(InvoiceModel)
  declare model: InvoiceModel;

  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Exported()
  @Sortable()
  @Access(AccessMode.ReadOnly)
  declare position: number;

  @Exported()
  @Computed((row) => row.key<Invoice, "position">("position").add(1))
  declare rank: number;
}

const ExportedRow = z.object({
  _id: z.string(),
  position: z.number(),
  rank: z.number(),
});

interface Collected {
  headers: string[];
  rows: z.infer<typeof ExportedRow>[];
}

interface CollectingExport {
  writer: ExportWriter;
  collected: Collected;
}

function collectingWriter(): CollectingExport {
  const collected: Collected = { headers: [], rows: [] };
  const writer: ExportWriter = {
    writeHeaders(headers) {
      collected.headers.push(...headers);
    },
    appendRow(_headers, row) {
      collected.rows.push(ExportedRow.parse(row));
    },
    close() {},
  };
  return { writer, collected };
}

const listParams: Parameters.ListParameters = {
  pluckMode: "export",
  sortKey: "position",
  sortDirection: "asc",
};

async function exportAll(ids?: string[]): Promise<Collected> {
  const { writer, collected } = collectingWriter();
  await generateTableViewExport({
    controller,
    ctx,
    listParams,
    writer,
    ids,
    user: USER,
    reportProgress: async () => {},
  });
  return collected;
}

function idsOf(collected: Collected): string[] {
  return collected.rows.map((row) => row._id);
}

const controller = new InvoiceAPI();

describe("[unit] implementations/dms-base/table-view — export batching", () => {
  let sourceIds: string[];

  before(async () => {
    await RegisterSchema(SCHEMA);
    const schema = Schema.get(SCHEMA);
    if (!schema) throw new Error("Missing test schema");
    const model = new InvoiceModel(schema.instance());
    controller.model = model;
    sourceIds = await model.insert(
      Array.from({ length: ROW_COUNT }, (_, position) => ({ position })),
    );
    expect(sourceIds).to.have.lengthOf(ROW_COUNT);
  });

  it("exports every source row exactly once across several batches", async () => {
    const collected = await exportAll();
    const exportedIds = idsOf(collected);

    expect(exportedIds).to.have.lengthOf(ROW_COUNT);
    expect(new Set(exportedIds).size).to.equal(ROW_COUNT);
    expect([...exportedIds].sort()).to.deep.equal([...sourceIds].sort());
  });

  it("keeps the exported rows in the requested order", async () => {
    const collected = await exportAll();

    expect(collected.rows.map((row) => row.position)).to.deep.equal(
      Array.from({ length: ROW_COUNT }, (_, position) => position),
    );
  });

  it("exports a multi-batch id selection exactly once", async () => {
    const collected = await exportAll(sourceIds);
    const exportedIds = idsOf(collected);

    expect(exportedIds).to.have.lengthOf(ROW_COUNT);
    expect(new Set(exportedIds).size).to.equal(ROW_COUNT);
  });

  it("exports the computed fields of every row, listed or selected", async () => {
    for (const collected of [await exportAll(), await exportAll(sourceIds)]) {
      expect(collected.headers).to.include("rank");
      const wrong = collected.rows.filter(
        (row) => row.rank !== row.position + 1,
      );
      expect(wrong).to.deep.equal([]);
    }
  });
});
