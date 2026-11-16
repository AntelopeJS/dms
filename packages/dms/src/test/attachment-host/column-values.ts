import { Controller, SetParameterProvider } from "@antelopejs/interface-api";
import { MakeParameterAndPropertyDecorator } from "@antelopejs/interface-core/decorators";
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
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import {
  RegisterPage,
  RootPageController,
} from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  Select,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";

const TABLE = "column-values-orders";

@RegisterTable(TABLE, TENANT_SCHEMA_NAME)
class ColumnValueOrder extends Table {
  @Field("string") declare title: string;
  @Field("string") declare status: string;
  @Field("string") declare currency: string;
  @Field("number") declare total: number;
  @Field(["string"]) declare labels: string[];
}

class ColumnValueOrderModel extends BasicDataModel(ColumnValueOrder, TABLE) {}

/** A model no request reaches, as when the connection that holds it is down. */
const UnreachableModel = MakeParameterAndPropertyDecorator(
  (target, key, index) => {
    SetParameterProvider(target, key, index, () => {
      throw new Error("the orders connection is down");
    });
  },
);

@RegisterDataController()
export class ColumnValueOrderController extends DataController(
  ColumnValueOrder,
  TableViewRoutes.All,
  Controller("/api/column-values/orders"),
) {
  @ModelReference()
  @TenantScopedModel(ColumnValueOrderModel)
  declare model: ColumnValueOrderModel;

  @Listable()
  @Select()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Select()
  @Column({ name: "Title", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare title: string;

  @Listable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({
      items: [],
      itemsFrom: { column: "status" },
    }),
    filterable: true,
  })
  @Access(AccessMode.ReadWrite)
  declare status: string;

  @Listable()
  @Column({ name: "Currency", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare currency: string;

  @Listable()
  @Column({
    name: "Total",
    type: new DefaultDataTypes.PriceType({
      currencyFrom: { column: "currency" },
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare total: number;

  @Listable()
  @Column({
    name: "Labels",
    type: new DefaultDataTypes.SelectType({
      multiple: true,
      items: [],
      itemsFrom: { column: "labels" },
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare labels: string[];
}

@RegisterPage()
export class ColumnValueOrdersPage extends RootPageController(
  "column-values-orders",
  { displayName: "Orders" },
) {
  static content = TableView(ColumnValueOrderController, {
    realtime: false,
    rowActions: { add: true },
    tabsFrom: { column: "status" },
  });
}

@RegisterDataController()
export class UnreachableOrderController extends DataController(
  ColumnValueOrder,
  { list: TableViewRoutes.List },
  Controller("/api/column-values/unreachable-orders"),
) {
  @ModelReference()
  @UnreachableModel()
  declare model: ColumnValueOrderModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({
      items: [],
      itemsFrom: { column: "status" },
    }),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare status: string;

  @Listable()
  @Column({
    name: "Total",
    type: new DefaultDataTypes.PriceType({
      currencyFrom: { column: "currency" },
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare total: number;
}

@RegisterPage()
export class UnreachableOrdersPage extends RootPageController(
  "column-values-unreachable",
  { displayName: "Unreachable orders" },
) {
  static content = TableView(UnreachableOrderController, {
    realtime: false,
    tabsFrom: { column: "status" },
  });
}
