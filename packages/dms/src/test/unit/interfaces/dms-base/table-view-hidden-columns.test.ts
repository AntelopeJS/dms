import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  TableView,
  type TableViewOptionsSerialized,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

const TABLE = "hidden-columns-invoices";
const LOCATION = "/api/hidden-columns-invoices";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Invoice extends Table {
  @Field("string") declare number: string;
  @Field("string") declare workspace: string;
  @Field("number") declare total: number;
}

class InvoiceModel extends BasicDataModel(Invoice, TABLE) {}

@RegisterDataController()
class InvoiceAPI extends DataController(
  Invoice,
  { list: TableViewRoutes.List },
  Controller(LOCATION),
) {
  @ModelReference()
  @Model(InvoiceModel)
  declare model: InvoiceModel;

  @Listable()
  @Column({ name: "Number", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare number: string;

  @Listable()
  @Column({
    name: "Workspace",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare workspace: string;

  @Listable()
  @Column({
    name: "Total",
    type: new DefaultDataTypes.NumberType(),
    isVisible: false,
  })
  @Access(AccessMode.ReadOnly)
  declare total: number;
}

type InvoiceOptions = NonNullable<
  Parameters<typeof TableView<typeof InvoiceAPI>>[1]
>;

const READ_ONLY = { add: false, duplicate: false, edit: false, delete: false };

interface SerializedColumn {
  id: string;
  isVisible?: boolean;
  listable: boolean;
  enableColumnFilter: boolean;
}

const columnsOf = (options: InvoiceOptions): SerializedColumn[] =>
  // SAFETY: TableView serializes metadata columns including id and visibility; its public options type omits the runtime columns property.
  (
    TableView(InvoiceAPI, {
      realtime: false,
      rowActions: READ_ONLY,
      ...options,
    }).serializeSync().options as TableViewOptionsSerialized & {
      columns: SerializedColumn[];
    }
  ).columns;

const visibility = (columns: SerializedColumn[]) =>
  Object.fromEntries(columns.map((column) => [column.id, column.isVisible]));

describe("[unit] interfaces/dms-base — a table view's hidden columns", () => {
  it("opens the columns it hides hidden, on its own copy of them", () => {
    const related = columnsOf({ columns: { hidden: ["workspace"] } });
    expect(visibility(related)).to.deep.equal({
      number: undefined,
      workspace: false,
      total: false,
    });
    const workspace = related.find((column) => column.id === "workspace")!;
    expect(workspace.listable).to.equal(true);
    expect(workspace.enableColumnFilter).to.equal(true);

    expect(visibility(columnsOf({}))).to.deep.equal({
      number: undefined,
      workspace: undefined,
      total: false,
    });
  });

  it("refuses a hidden column the controller lacks", () => {
    expect(() => columnsOf({ columns: { hidden: ["customer"] } })).to.throw(
      'TableView columns.hidden on InvoiceAPI references unknown column "customer"',
    );
  });
});
