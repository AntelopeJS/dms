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
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  DefaultDisplays,
  TableView,
  type TableViewOptions,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import { serializedColumnsOf } from "../../../helpers/serialized-columns";

const TABLE = "reduced-chrome-orders";
const LOCATION = "/api/reduced-chrome-orders";
export const LINES_LOCATION = "/api/reduced-chrome-lines";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Order extends Table {
  @Field("string") declare number: string;
  @Field("string") declare status: string;
  @Field("string") declare carrier: string;
}

class OrderModel extends BasicDataModel(Order, TABLE) {}

@RegisterDataController()
export class OrderAPI extends DataController(
  Order,
  { list: TableViewRoutes.List, countBatch: TableViewRoutes.CountBatch },
  Controller(LOCATION),
) {
  @ModelReference()
  @Model(OrderModel)
  declare model: OrderModel;

  @Listable()
  @Column({
    name: "Order",
    type: new DefaultDataTypes.StringType(),
    size: 220,
    display: new DefaultDisplays.IdentityDisplay({ icon: "i-ph-x" }),
  })
  @Access(AccessMode.ReadOnly)
  declare number: string;

  @Listable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({ items: [] }),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare status: string;

  @Listable()
  @Column({
    name: "Carrier",
    type: new DefaultDataTypes.StringType(),
    isVisible: false,
  })
  @Access(AccessMode.ReadOnly)
  declare carrier: string;
}

@RegisterDataController()
export class LineAPI extends DataController(
  Order,
  { list: TableViewRoutes.List },
  Controller(LINES_LOCATION),
) {}

const SEARCHABLE_LOCATION = "/api/reduced-chrome-searchable";

@RegisterDataController()
export class SearchableOrderAPI extends DataController(
  Order,
  { list: TableViewRoutes.List },
  Controller(SEARCHABLE_LOCATION),
) {
  @Listable()
  @Searchable()
  @Column({ name: "Order", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare number: string;
}

const STATUS_LOCATION = "/api/reduced-chrome-status";

@RegisterDataController()
export class StatusOrderAPI extends DataController(
  Order,
  { list: TableViewRoutes.List },
  Controller(STATUS_LOCATION),
) {
  @Listable()
  @Column({ name: "Order", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare number: string;

  @Listable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({
      items: [{ value: "open", label: "Open" }],
    }),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare status: string;

  @Listable()
  @Column({ name: "Carrier", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare carrier: string;
}

export const optionsOf = (table: ReturnType<typeof TableView>) =>
  table.serializeSync().options!;

export const columnsOf = (table: ReturnType<typeof TableView>) =>
  serializedColumnsOf(optionsOf(table));

export type DisplayDeclarations = Pick<TableViewOptions, "displays" | "kanban">;
