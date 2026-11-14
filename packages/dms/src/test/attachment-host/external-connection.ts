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
import { ExternalConnection } from "@antelopejs/interface-dms/connection-access";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import {
  RegisterPage,
  RootPageController,
} from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  ArchiveField,
  Column,
  Select,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

const TABLE = "external-countries";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
export class ExternalCountry extends Table {
  @Field("string") declare name: string;
  @Field("boolean") declare isArchived?: boolean;
}

export class ExternalCountryModel extends BasicDataModel(
  ExternalCountry,
  TABLE,
) {}

/** A table mapped from the external connection `erp`, serving every route as a writable mapping does. */
@RegisterDataController()
@ExternalConnection("erp")
export class ExternalCountryController extends DataController(
  ExternalCountry,
  TableViewRoutes.All,
  Controller("/api/external/countries"),
) {
  @ModelReference()
  @Model(ExternalCountryModel)
  declare model: ExternalCountryModel;

  @Listable()
  @Select()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Select()
  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @ArchiveField()
  declare isArchived: boolean;
}

@RegisterPage()
export class ExternalCountriesPage extends RootPageController(
  "external-countries",
  { displayName: "Countries" },
) {
  static content = TableView(ExternalCountryController, {
    realtime: false,
    archiveMode: true,
    rowActions: { add: true },
  });
}
