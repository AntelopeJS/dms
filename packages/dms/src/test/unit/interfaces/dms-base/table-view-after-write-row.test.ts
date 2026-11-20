import { Controller, type RequestContext } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import type {
  Parameters as DataParameters,
  Validation,
} from "@antelopejs/interface-data-api/components";
import {
  Access,
  AccessMode,
  ModelReference,
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
import { createGuardedWriteRoute } from "@antelopejs/interface-dms/base/table-view/internal/guards";
import { TableViewMeta } from "@antelopejs/interface-dms/base/table-view/meta";
import type { TableViewGuards } from "@antelopejs/interface-dms/base/types/guards";
import { expect } from "chai";
import { requestContextFixture } from "../../../helpers/request-context";

const SCHEMA = "after-write-row-test";
const TABLE = "invoices";
const ctx = requestContextFixture();

@RegisterTable(TABLE, SCHEMA)
class Invoice extends Table {
  @Field("string")
  declare customer: string;
  @Field("string")
  declare number: string;
}
class InvoiceModel extends BasicDataModel(Invoice, TABLE) {}

@RegisterDataController()
class InvoiceAPI extends DataController(
  Invoice,
  { new: DefaultRoutes.New, edit: DefaultRoutes.Edit },
  Controller("/after-write-row-test"),
) {
  @ModelReference()
  @Model(InvoiceModel)
  declare model: InvoiceModel;
  @Access(AccessMode.ReadWrite)
  declare customer: string;
  @Access(AccessMode.ReadWrite)
  declare number: string;
}

const controller = new InvoiceAPI();
const newRoute = createGuardedWriteRoute(DefaultRoutes.New, "new");
const editRoute = createGuardedWriteRoute(DefaultRoutes.Edit, "edit");

/** An edit written through `TableViewRoutes.EditWith`'s shape: it writes the row and answers nothing. */
const silentEditRoute = createGuardedWriteRoute(
  {
    ...DefaultRoutes.Edit,
    func: async function (
      this: InvoiceAPI,
      context: RequestContext,
      params: DataParameters.EditParameters,
      body: Validation.WrittenBody,
    ) {
      await DefaultRoutes.Edit.func.call(this, context, params, body);
    },
  },
  "edit",
);

const json = (body: Partial<Invoice>) => Buffer.from(JSON.stringify(body));

function withGuards(guards: TableViewGuards<InvoiceAPI>): void {
  GetMetadata(InvoiceAPI, TableViewMeta).setControllerGuards(guards);
}

describe("[unit] interfaces/dms-base/table-view — the row an after-write receives", () => {
  let model: InvoiceModel;
  const written: (InvoiceAPI & { _id: string })[] = [];

  before(async () => {
    await RegisterSchema(SCHEMA);
    const schema = Schema.get(SCHEMA);
    if (!schema) throw new Error("Missing test schema");
    model = new InvoiceModel(schema.instance());
    controller.model = model;
  });

  beforeEach(() => {
    written.length = 0;
  });

  it("hands a new guard's after-write the created row, with its new id and the guard's amendments", async () => {
    withGuards({
      new: (_ctx, { body }) => {
        body.number = "INV-0042";
        return (row) => void written.push(row);
      },
    });
    const answer = await newRoute.func.call(
      controller,
      ctx,
      {},
      json({ customer: "Acme" }),
    );
    expect(written).to.have.length(1);
    const [created] = written;
    const createdId: string = created._id;
    expect(createdId).to.equal(answer._id);
    expect(created).to.include({ customer: "Acme", number: "INV-0042" });
  });

  it("hands an edit guard's after-write the row as the edit left it", async () => {
    const [id] = await model.insert({ customer: "Acme", number: "INV-1" });
    const seen: string[] = [];
    withGuards({
      edit: (_ctx, { current }) => {
        seen.push(current.customer);
        return (row) => void written.push(row);
      },
    });
    await editRoute.func.call(
      controller,
      ctx,
      { id },
      json({ customer: "Globex" }),
    );
    expect(seen).to.deep.equal(["Acme"]);
    expect(written).to.have.length(1);
    expect(written[0]).to.include({
      _id: id,
      customer: "Globex",
      number: "INV-1",
    });
  });

  it("reads the edited row back when the route answers nothing", async () => {
    const [id] = await model.insert({ customer: "Acme", number: "INV-2" });
    withGuards({ edit: () => (row) => void written.push(row) });
    await silentEditRoute.func.call(
      controller,
      ctx,
      { id },
      json({ customer: "Initech" }),
    );
    expect(written).to.have.length(1);
    expect(written[0]).to.include({ _id: id, customer: "Initech" });
  });

  it("reads the edited row back by its primary key when the edit changes the row id key", async () => {
    const [id] = await model.insert({ customer: "Acme", number: "INV-3" });
    const { options } = GetMetadata(InvoiceAPI, TableViewMeta);
    options.rowIdKey = "number";
    withGuards({ edit: () => (row) => void written.push(row) });
    try {
      await editRoute.func.call(
        controller,
        ctx,
        { id: "INV-3", index: "number" },
        json({ number: "INV-4" }),
      );
    } finally {
      delete options.rowIdKey;
    }
    expect(written).to.have.length(1);
    expect(written[0]).to.include({ _id: id, number: "INV-4" });
  });
});
