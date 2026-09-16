import { Controller, type RequestContext } from "@antelopejs/interface-api";
import { DataController } from "@antelopejs/interface-data-api";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import {
  Access,
  AccessMode,
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
import type { User } from "@antelopejs/interface-dms/auth/db";
import { Exported } from "@antelopejs/interface-dms/base/table-view";
import { expect } from "chai";
import {
  EXPORT_BATCH_SIZE,
  generateTableViewExport,
} from "../../../../implementations/dms-base/table-view";
import type { ExportWriter } from "../../../../utils";

const SCHEMA = "export-batching-test";
const TABLE = "invoices";
const USER = { _id: "export-batching-user" } as User;
const ctx = {
  url: new URL("http://localhost/export"),
} as RequestContext;

// Two full pages plus a partial one: the third iteration is where the
// (start, end) misreading of slice() overlaps the widest.
const ROW_COUNT = EXPORT_BATCH_SIZE * 2 + Math.floor(EXPORT_BATCH_SIZE / 2);
const ID_FIELD = "_id";

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
}

class CollectingWriter implements ExportWriter {
  readonly headers: string[] = [];
  readonly rows: Record<string, unknown>[] = [];

  writeHeaders(headers: string[]): void {
    this.headers.push(...headers);
  }

  appendRow(_headers: string[], row: Record<string, unknown>): void {
    this.rows.push(row);
  }

  close(): void {}
}

const listParams: Parameters.ListParameters = {
  pluckMode: "export",
  sortKey: "position",
  sortDirection: "asc",
};

async function exportAll(ids?: string[]): Promise<CollectingWriter> {
  const writer = new CollectingWriter();
  await generateTableViewExport({
    controller: controller as never,
    ctx,
    listParams,
    writer,
    ids,
    user: USER,
    reportProgress: async () => {},
  });
  return writer;
}

function idsOf(writer: CollectingWriter): string[] {
  return writer.rows.map((row) => String(row[ID_FIELD]));
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
    const writer = await exportAll();
    const exportedIds = idsOf(writer);

    expect(exportedIds).to.have.lengthOf(ROW_COUNT);
    expect(new Set(exportedIds).size).to.equal(ROW_COUNT);
    expect([...exportedIds].sort()).to.deep.equal([...sourceIds].sort());
  });

  it("keeps the exported rows in the requested order", async () => {
    const writer = await exportAll();

    expect(writer.rows.map((row) => row.position)).to.deep.equal(
      Array.from({ length: ROW_COUNT }, (_, position) => position),
    );
  });

  // The id-scoped export (a selection larger than one page) paginates through
  // the same loop from a different query builder.
  it("exports a multi-batch id selection exactly once", async () => {
    const writer = await exportAll(sourceIds);
    const exportedIds = idsOf(writer);

    expect(exportedIds).to.have.lengthOf(ROW_COUNT);
    expect(new Set(exportedIds).size).to.equal(ROW_COUNT);
  });
});
