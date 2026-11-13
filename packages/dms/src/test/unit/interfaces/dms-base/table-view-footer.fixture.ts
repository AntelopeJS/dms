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
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

const TABLE = "footer-payments";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Payment extends Table {
  @Field("string") declare status: string;
  @Field("number") declare amount: number;
  @Field("string") declare note: string;
}

class PaymentModel extends BasicDataModel(Payment, TABLE) {}

@RegisterDataController()
export class PaymentAPI extends DataController(
  Payment,
  { list: TableViewRoutes.List, summary: TableViewRoutes.Summary },
  Controller("/api/footer-payments"),
) {
  @ModelReference()
  @Model(PaymentModel)
  declare model: PaymentModel;

  @Listable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.SelectType({
      items: [{ value: "failed", label: "Failed" }],
    }),
    filterable: true,
  })
  @Access(AccessMode.ReadOnly)
  declare status: string;

  @Listable()
  @Column({ name: "Amount", type: new DefaultDataTypes.PriceType() })
  @Access(AccessMode.ReadOnly)
  declare amount: number;

  @Listable()
  @Column({ name: "Note", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare note: string;
}

export type PaymentOptions = NonNullable<
  Parameters<typeof TableView<typeof PaymentAPI>>[1]
>;

export const READ_ONLY = {
  add: false,
  duplicate: false,
  edit: false,
  delete: false,
};

export const optionsOf = (options: PaymentOptions) =>
  TableView(PaymentAPI, {
    realtime: false,
    rowActions: READ_ONLY,
    ...options,
  }).serializeSync().options!;
