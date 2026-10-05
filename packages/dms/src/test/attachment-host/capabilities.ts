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
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import {
  BasicDataModel,
  Field,
  Model,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import {
  RegisterPage,
  RootPageController,
} from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

// Invoices behind the table view capabilities the server takes part in:
// footer summaries and filter tokens.

const TABLE = "capability-invoices";

export const INVOICE_STATUSES = [
  { value: "open", label: "Open", textColor: "warning" },
  { value: "paid", label: "Paid", textColor: "success" },
];

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
export class Invoice extends Table {
  @Field("string") declare number: string;
  @Field("string") declare status: string;
  @Field("number") declare amount: number;
  @Field("string") declare ownerId?: string;
}

export class InvoiceModel extends BasicDataModel(Invoice, TABLE) {}

@RegisterDataController()
export class CapabilityInvoiceController extends DataController(
  Invoice,
  TableViewRoutes.All,
  Controller("/api/capabilities/invoices"),
) {
  @ModelReference()
  @Model(InvoiceModel)
  declare model: InvoiceModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Listable()
  @Sortable()
  @Column({
    name: "Number",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare number: string;

  @Listable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({ items: INVOICE_STATUSES }),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare status: string;

  @Listable()
  @Column({ name: "Amount", type: new DefaultDataTypes.NumberType() })
  @Access(AccessMode.ReadWrite)
  declare amount: number;

  @Listable()
  @Column({
    name: "Owner",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare ownerId: string;

}

@RegisterPage()
export class CapabilityInvoicesPage extends RootPageController(
  "capability-invoices",
  { displayName: "Invoices" },
) {
  static content = TableView(CapabilityInvoiceController, {
    realtime: false,
    rowActions: { add: true, hasSelection: true },
    footer: {
      summary: [
        { label: "Total", field: "amount", op: "sum" },
        {
          label: "Open",
          op: "count",
          where: { field: "status", equals: "open" },
        },
        {
          label: "Open or large",
          field: "amount",
          op: "sum",
          where: {
            or: [
              { field: "status", in: ["open"] },
              { not: { field: "amount", notIn: [500] } },
            ],
          },
        },
      ],
      legend: "status",
    },
    views: {
      items: [
        {
          id: "mine",
          label: "Mine",
          count: true,
          filters: [
            { accessorKey: "ownerId", mode: "is", value: "{{user.id}}" },
          ],
        },
      ],
    },
  });
}
