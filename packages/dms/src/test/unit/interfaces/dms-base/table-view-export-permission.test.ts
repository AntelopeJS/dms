import { Controller } from "@antelopejs/interface-api";
import { ImplementInterface } from "@antelopejs/interface-core";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import {
  TableView,
  type TableViewOptionsSerialized,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";

const TABLE = "export-permission-rows";
const COMPONENT_PERMISSION_ID = "pages.export-demo.table";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Row extends Table {}

@RegisterDataController()
class ExportAPI extends DataController(
  Row,
  { list: TableViewRoutes.List, ...TableViewRoutes.ExportRoutes },
  Controller("/api/export-permission-rows"),
) {}

async function servedOptions(
  permissions: string[],
): Promise<TableViewOptionsSerialized> {
  const builder = TableView(ExportAPI, { realtime: false });
  const { options } = builder.serializeSync();
  const filter = builder.onFilterCallback;
  if (!filter || !options) throw new Error("table view without a filter");
  return filter(
    new Set(withPermissionAncestors(permissions)),
    options,
    COMPONENT_PERMISSION_ID,
    {
      tenantId: "export-tenant",
      user: undefined,
    },
  );
}

describe("[unit] interfaces/dms-base/table-view — export follows its permission", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
  });

  it("serves the export entry to a caller holding the export action", async () => {
    const options = await servedOptions([
      `${COMPONENT_PERMISSION_ID}.list`,
      `${COMPONENT_PERMISSION_ID}.export`,
    ]);
    expect(options.enableTableExport).to.equal(true);
  });

  it("leaves the export entry out for a caller the export routes refuse", async () => {
    const options = await servedOptions([`${COMPONENT_PERMISSION_ID}.list`]);
    expect(options.enableTableExport).to.equal(false);
  });
});
