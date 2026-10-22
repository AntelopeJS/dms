import {
  Context,
  Controller,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import {
  DataController,
  DefaultRoutes,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
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
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import {
  RegisterPage,
  RootPageController,
} from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  resolveBulkRowIds,
  TableView,
  TableViewMeta,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

// Invoices behind the table view capabilities the server takes part in:
// footer summaries, filter tokens and a bulk route finding its rows.

const TABLE = "capability-invoices";

export const INVOICE_STATUSES = [
  { value: "open", label: "Open", textColor: "warning" },
  { value: "paid", label: "Paid", textColor: "success" },
];

export const INVOICE_LABELS = [
  { value: "urgent", label: "Urgent" },
  { value: "export", label: "Export" },
];

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
export class Invoice extends Table {
  @Field("string") declare number: string;
  @Field("string") declare customer?: string;
  @Field("string") declare status: string;
  @Field("number") declare amount: number;
  @Field("string") declare ownerId?: string;
  @Field("date") declare dueAt?: Date;
  @Field("object") declare period?: { start: Date; end: Date };
  @Field(["string"]) declare labels?: string[] | null;
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

  // Searchable without being filterable, and declared first, so the search
  // starts from a field that has no data-api filter.
  @Searchable()
  @Listable()
  @Column({ name: "Customer", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare customer: string;

  @Searchable()
  @Listable()
  @Sortable()
  @Column({
    name: "Number",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
  })
  @Mandatory("edit")
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

  // Optional, so a row saved without labels holds null or no field at all.
  @Listable()
  @Column({
    name: "Labels",
    type: new DefaultDataTypes.SelectType({
      items: INVOICE_LABELS,
      multiple: true,
    }),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare labels: string[];

  @Column({ name: "Due", type: new DefaultDataTypes.DateType() })
  @Access(AccessMode.ReadWrite)
  declare dueAt: Date;

  @Column({
    name: "Billing period",
    type: new DefaultDataTypes.DateType({ range: true }),
  })
  @Access(AccessMode.ReadWrite)
  declare period: { start: Date; end: Date };

  /** Marks the selected invoices paid, or every one the filters match. */
  @Post("mark-paid")
  async markPaid(
    @Context() ctx: RequestContext,
    @AuthUser() user: User,
  ): Promise<{ ids: string[] }> {
    const ids = await resolveBulkRowIds(this, ctx, user);
    await Promise.all(
      ids.map((id) => this.model.update(id, { status: "paid" })),
    );
    return { ids };
  }
}

// A route outside the invoices' data controller (a page's would do the same)
// finding the rows of their table from its own model and the table's
// metadata.
export class InvoiceBulkController extends Controller(
  "/api/capabilities/invoice-bulk",
) {
  @Model(InvoiceModel)
  declare invoices: InvoiceModel;

  @Post("matching")
  async matching(
    @Context() ctx: RequestContext,
    @AuthUser() user: User,
  ): Promise<{ ids: string[] }> {
    const tableView = GetMetadata(CapabilityInvoiceController, TableViewMeta);
    return {
      ids: await resolveBulkRowIds(
        { model: this.invoices, tableView },
        ctx,
        user,
      ),
    };
  }
}

// The same invoices behind a route scope: every list-like route, the tab
// counters' batch count included, only ever sees the open ones.
const OPEN_SCOPE = { filters: { status: ["open", "is"] as [string, string] } };

@RegisterDataController()
export class ScopedInvoiceController extends DataController(
  Invoice,
  {
    ...TableViewRoutes.All,
    list: DefaultRoutes.WithOptions(TableViewRoutes.List, OPEN_SCOPE),
    count: DefaultRoutes.WithOptions(TableViewRoutes.Count, OPEN_SCOPE),
    countBatch: DefaultRoutes.WithOptions(
      TableViewRoutes.CountBatch,
      OPEN_SCOPE,
    ),
  },
  Controller("/api/capabilities/open-invoices"),
) {
  @ModelReference()
  @Model(InvoiceModel)
  declare model: InvoiceModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Column({
    name: "Number",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare number: string;

  @Listable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({ items: INVOICE_STATUSES }),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare status: string;

  @Listable()
  @Column({
    name: "Owner",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
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
