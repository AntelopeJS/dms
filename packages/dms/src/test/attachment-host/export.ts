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
import {
  Column,
  DefaultDisplays,
  Exported,
  Select,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

// Deals naming a customer, exported for a reader (the default) and as stored
// (`exportValues: "raw"`), over the same rows. The labels are keys the DMS's
// own catalogs carry, so the export reads them in the caller's language.

const CUSTOMERS = "export-customers";
const DEALS = "export-deals";

@RegisterTable(CUSTOMERS, CORE_SCHEMA_NAME)
export class ExportCustomer extends Table {
  @Field("string") declare name: string;
}

export class ExportCustomerModel extends BasicDataModel(
  ExportCustomer,
  CUSTOMERS,
) {}

@RegisterDataController()
export class ExportCustomerController extends DataController(
  ExportCustomer,
  {
    list: TableViewRoutes.List,
    select: TableViewRoutes.Select,
    new: TableViewRoutes.New,
  },
  Controller("/api/export/customers"),
) {
  @ModelReference()
  @Model(ExportCustomerModel)
  declare model: ExportCustomerModel;

  @Listable()
  @Select()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Select()
  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare name: string;
}

@RegisterTable(DEALS, CORE_SCHEMA_NAME)
export class ExportDeal extends Table {
  @Field("string") declare title: string;
  @Field("string") declare customer: string;
  @Field("string") declare stage: string;
  @Field("date") declare expectedClose: Date;
  @Field("date") declare lastContact: Date;
  @Field("number") declare probability: number;
  @Field("number") declare amount: number;
  @Field("boolean") declare isWon: boolean;
}

export class ExportDealModel extends BasicDataModel(ExportDeal, DEALS) {}

const STAGES = [
  { value: "visit", label: "$common.status.online" },
  { value: "lost", label: "$common.status.offline" },
];

@RegisterDataController()
export class ExportDealController extends DataController(
  ExportDeal,
  {
    list: TableViewRoutes.List,
    new: TableViewRoutes.New,
    ...TableViewRoutes.ExportRoutes,
  },
  Controller("/api/export/deals"),
) {
  @ModelReference()
  @Model(ExportDealModel)
  declare model: ExportDealModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Exported()
  @Listable()
  @Sortable()
  @Column({
    name: "$dms.table.views.name_label",
    type: new DefaultDataTypes.StringType(),
  })
  @Access(AccessMode.ReadWrite)
  declare title: string;

  @Exported()
  @Listable()
  @Column({
    name: "Customer",
    type: new DefaultDataTypes.RelationType({
      dataApiController: ExportCustomerController,
      keyMapping: { label: "name", value: "_id" },
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare customer: string;

  @Exported()
  @Listable()
  @Column({
    name: "Stage",
    type: new DefaultDataTypes.SelectType({ items: STAGES }),
  })
  @Access(AccessMode.ReadWrite)
  declare stage: string;

  @Exported()
  @Listable()
  @Column({ name: "Expected close", type: new DefaultDataTypes.DateType() })
  @Access(AccessMode.ReadWrite)
  declare expectedClose: Date;

  @Exported()
  @Listable()
  @Column({
    name: "Last contact",
    type: new DefaultDataTypes.DateType(),
    display: new DefaultDisplays.RelativeDateDisplay(),
  })
  @Access(AccessMode.ReadWrite)
  declare lastContact: Date;

  @Exported()
  @Listable()
  @Column({
    name: "Probability",
    type: new DefaultDataTypes.PercentageType(),
  })
  @Access(AccessMode.ReadWrite)
  declare probability: number;

  @Exported()
  @Listable()
  @Column({ name: "Amount", type: new DefaultDataTypes.PriceType() })
  @Access(AccessMode.ReadWrite)
  declare amount: number;

  @Exported()
  @Listable()
  @Column({ name: "Won", type: new DefaultDataTypes.BooleanType() })
  @Access(AccessMode.ReadWrite)
  declare isWon: boolean;
}

@RegisterDataController()
export class RawExportDealController extends DataController(
  ExportDeal,
  {},
  Controller("/api/export/raw-deals", ExportDealController),
) {}

@RegisterPage()
export class ExportDealsPage extends RootPageController("export-deals", {
  displayName: "Deals",
}) {
  static content = TableView(ExportDealController, { realtime: false });
}

@RegisterPage()
export class RawExportDealsPage extends RootPageController("export-raw-deals", {
  displayName: "Raw deals",
}) {
  static content = TableView(RawExportDealController, {
    realtime: false,
    exportValues: "raw",
  });
}
