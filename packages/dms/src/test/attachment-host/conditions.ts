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
import {
  Column,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

// Deals whose columns depend on the stage: the loss reason shows, and is
// mandatory, on a lost deal only; the probability is locked once the deal is
// won or lost.

const TABLE = "condition-deals";
const CUSTOMER_TABLE = "condition-customers";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
export class ConditionDeal extends Table {
  @Field("string") declare title: string;
  @Field("string") declare stage: string;
  @Field("string") declare lostReason?: string;
  @Field("number") declare probability?: number;
}

export class ConditionDealModel extends BasicDataModel(ConditionDeal, TABLE) {}

@RegisterDataController()
export class ConditionDealController extends DataController(
  ConditionDeal,
  TableViewRoutes.All,
  Controller("/api/conditions/deals"),
) {
  @ModelReference()
  @Model(ConditionDealModel)
  declare model: ConditionDealModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Mandatory("new")
  @Column({ name: "Title", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare title: string;

  @Listable()
  @Column({ name: "Stage", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare stage: string;

  @Listable()
  @Mandatory("new", "edit")
  @Column({
    name: "Loss reason",
    type: new DefaultDataTypes.StringType(),
    visibleWhen: { field: "stage", in: ["lost"] },
  })
  @Access(AccessMode.ReadWrite)
  declare lostReason: string;

  @Listable()
  @Column({
    name: "Probability",
    type: new DefaultDataTypes.NumberType(),
    disabledWhen: { field: "stage", in: ["won", "lost"] },
  })
  @Access(AccessMode.ReadWrite)
  declare probability: number;
}

@RegisterPage()
export class ConditionDealsPage extends RootPageController("condition-deals", {
  displayName: "Deals",
}) {
  static content = TableView(ConditionDealController, {
    realtime: false,
    rowActions: { add: true, edit: true },
  });
}

// Customers whose VAT number is a business's only: turned household, the
// customer loses the number it stored.

@RegisterTable(CUSTOMER_TABLE, CORE_SCHEMA_NAME)
export class ConditionCustomer extends Table {
  @Field("string") declare name: string;
  @Field("string") declare kind: string;
  @Field("string") declare vatNumber?: string;
}

export class ConditionCustomerModel extends BasicDataModel(
  ConditionCustomer,
  CUSTOMER_TABLE,
) {}

@RegisterDataController()
export class ConditionCustomerController extends DataController(
  ConditionCustomer,
  TableViewRoutes.All,
  Controller("/api/conditions/customers"),
) {
  @ModelReference()
  @Model(ConditionCustomerModel)
  declare model: ConditionCustomerModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Listable()
  @Column({ name: "Kind", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare kind: string;

  @Listable()
  @Mandatory("new", "edit")
  @Column({
    name: "VAT number",
    type: new DefaultDataTypes.StringType(),
    visibleWhen: { field: "kind", in: ["business"] },
  })
  @Access(AccessMode.ReadWrite)
  declare vatNumber: string;
}

@RegisterPage()
export class ConditionCustomersPage extends RootPageController(
  "condition-customers",
  { displayName: "Customers" },
) {
  static content = TableView(ConditionCustomerController, {
    realtime: false,
    rowActions: { add: true, edit: true },
  });
}
