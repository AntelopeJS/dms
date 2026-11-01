import { Controller } from "@antelopejs/interface-api";
import { ImplementInterface } from "@antelopejs/interface-core";
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
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import {
  Column,
  TableView,
  type TableViewOptionsSerialized,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

const PERMISSION_ID = "pages.read-only-add.table";

@RegisterTable("read-only-add-rows", CORE_SCHEMA_NAME)
class Row extends Table {
  @Field("string") declare name: string;
}

class RowModel extends BasicDataModel(Row, "read-only-add-rows") {}

@RegisterDataController()
class ReadOnlyAPI extends DataController(
  Row,
  { list: TableViewRoutes.List, get: TableViewRoutes.Get },
  Controller("/api/read-only-add-rows"),
) {
  @ModelReference()
  @Model(RowModel)
  declare model: RowModel;

  @Listable()
  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare name: string;
}

@RegisterDataController()
class WritableAPI extends DataController(
  Row,
  {
    list: TableViewRoutes.List,
    get: TableViewRoutes.Get,
    new: TableViewRoutes.New,
  },
  Controller("/api/writable-add-rows"),
) {
  @ModelReference()
  @Model(RowModel)
  declare model: RowModel;

  @Listable()
  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare name: string;
}

async function servedOptions(
  controller: typeof ReadOnlyAPI | typeof WritableAPI,
): Promise<TableViewOptionsSerialized> {
  const builder = TableView(controller, { realtime: false });
  const { options } = builder.serializeSync();
  const filter = builder.onFilterCallback;
  if (!filter || !options) throw new Error("table view without a filter");
  return filter(new Set(["*"]), options, PERMISSION_ID, {
    tenantId: "read-only-tenant",
    user: undefined,
  });
}

describe("[unit] interfaces/dms-base/table-view: no add without a new route", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
  });

  it("does not offer add or duplicate on a controller with no new route, even for a caller holding every permission", async () => {
    const options = await servedOptions(ReadOnlyAPI);
    expect(options.rowActions?.add).to.equal(false);
    expect(options.rowActions?.duplicate).to.equal(false);
  });

  it("offers add where the controller mounts the new route and the caller holds add", async () => {
    const options = await servedOptions(WritableAPI);
    expect(options.rowActions?.add).to.not.equal(false);
  });
});
