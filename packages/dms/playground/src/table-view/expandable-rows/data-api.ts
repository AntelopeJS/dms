import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  Mandatory,
  ModelReference,
  Optional,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { Model } from "@antelopejs/interface-database-decorators";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  Exported,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import {
  Order,
  type OrderEvent,
  type OrderLine,
  OrderModel,
  type OrderStatus,
} from "./database";

export const ORDER_STATUSES = [
  { value: "pending", label: "Pending", textColor: "warning" },
  { value: "paid", label: "Paid", textColor: "success" },
  { value: "shipped", label: "Shipped", textColor: "info" },
  { value: "refunded", label: "Refunded", textColor: "neutral" },
];

/**
 * Orders of the "Expandable rows" demo. The grid lists the order head; the
 * shipping and payment fields are listed but hidden from the grid
 * (`isVisible: false`) so the detail band shows them. `lines`/`events` are
 * neither columns nor listed: the band's component gets them from `get`
 * when a row opens (`lazyLoad`).
 */
@RegisterDataController()
export class orderDataAPI extends DataController(
  Order,
  TableViewRoutes.All,
  Controller("/api/playground/orders"),
) {
  @ModelReference()
  @Model(OrderModel)
  declare model: OrderModel;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Listable()
  @Exported()
  @Sortable()
  @Column({
    name: "Order",
    type: new DefaultDataTypes.StringType({ placeholder: "#10483" }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare number: string;

  @Searchable()
  @Listable()
  @Exported()
  @Sortable()
  @Column({
    name: "Customer",
    type: new DefaultDataTypes.StringType({ placeholder: "Company name" }),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare customer: string;

  @Listable()
  @Exported()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({ items: ORDER_STATUSES }),
    filterable: true,
    defaultValue: "pending",
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare status: OrderStatus;

  @Listable()
  @Exported()
  @Sortable()
  @Column({
    name: "Placed",
    type: new DefaultDataTypes.DateType(),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare placedAt: Date;

  @Listable()
  @Exported()
  @Sortable()
  @Column({
    name: "Items",
    type: new DefaultDataTypes.NumberType({ min: 0 }),
  })
  @Access(AccessMode.ReadWrite)
  declare itemCount: number;

  @Listable()
  @Exported()
  @Sortable()
  @Column({
    name: "Total",
    type: new DefaultDataTypes.PriceType({ min: 0 }),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare total: number;

  @Listable()
  @Exported()
  @Column({
    name: "Email",
    type: new DefaultDataTypes.EmailType({ placeholder: "ops@company.com" }),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare email: string;

  @Listable()
  @Column({
    name: "Ship to",
    type: new DefaultDataTypes.AddressType(),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare shippingAddress: DefaultDataTypes.Address;

  @Listable()
  @Column({
    name: "Carrier",
    type: new DefaultDataTypes.StringType({ placeholder: "DHL Express" }),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare carrier: string;

  @Listable()
  @Column({
    name: "Payment",
    type: new DefaultDataTypes.SelectType({
      items: [
        { value: "card", label: "Card", icon: "i-ph-credit-card" },
        { value: "transfer", label: "Bank transfer", icon: "i-ph-bank" },
        { value: "invoice", label: "Invoice · 30 days", icon: "i-ph-receipt" },
      ],
    }),
    isVisible: false,
  })
  @Optional()
  @Access(AccessMode.ReadWrite)
  declare payment: string;

  /** Order lines, read by the detail band's component. */
  @Access(AccessMode.ReadOnly)
  declare lines: OrderLine[];

  /** Order timeline, read by the detail band's component. */
  @Access(AccessMode.ReadOnly)
  declare events: OrderEvent[];
}
