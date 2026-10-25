import { Controller } from "@antelopejs/interface-api";
import { ImplementInterface } from "@antelopejs/interface-core";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import { Access, AccessMode } from "@antelopejs/interface-data-api/metadata";
import {
  Field,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types";
import {
  Column,
  TableView,
  TableViewSchema,
  type TableViewOptions,
  type TableViewOptionsSerialized,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";

// `inlineEdit` writes through the edit route, and the frontend reads the
// fields it may edit from the edit form: both reach only a caller holding the
// edit action.

const TABLE = "inline-edit-rows";
const COMPONENT_PERMISSION_ID = "pages.inline-edit-demo.table";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Row extends Table {
  @Field("number") declare price: number;
}

@RegisterDataController()
class InlineEditAPI extends DataController(
  Row,
  {
    list: TableViewRoutes.List,
    get: TableViewRoutes.Get,
    edit: TableViewRoutes.Edit,
  },
  Controller("/api/inline-edit-rows"),
) {
  @Column({ name: "Price", type: new DefaultDataTypes.PriceType() })
  @Access(AccessMode.ReadWrite)
  declare price: number;
}

async function servedOptions(
  inlineEdit: TableViewOptions["inlineEdit"],
  permissions: string[],
): Promise<TableViewOptionsSerialized> {
  const builder = TableView(InlineEditAPI, { realtime: false, inlineEdit });
  const { options } = builder.serializeSync();
  const filter = builder.onFilterCallback;
  if (!filter || !options) throw new Error("table view without a filter");
  return filter(
    new Set(withPermissionAncestors(permissions)),
    options,
    COMPONENT_PERMISSION_ID,
    { tenantId: "inline-edit-tenant", user: undefined },
  );
}

describe("[unit] interfaces/dms-base/table-view — inline edit", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
  });

  it("serves the option, with the edit form, to a caller holding the edit action", async () => {
    const options = await servedOptions({ columns: ["price"] }, [
      `${COMPONENT_PERMISSION_ID}.list`,
      `${COMPONENT_PERMISSION_ID}.edit`,
    ]);
    expect(options.inlineEdit).to.deep.equal({ columns: ["price"] });
    expect(options.formComponents.edit).to.not.equal(undefined);
  });

  it("leaves it out for a caller the edit route refuses", async () => {
    const options = await servedOptions(true, [
      `${COMPONENT_PERMISSION_ID}.list`,
    ]);
    expect(options.inlineEdit).to.equal(undefined);
    expect(options.formComponents.edit).to.equal(undefined);
  });

  it("is a boolean or the columns to edit in the block schema", () => {
    expect(TableViewSchema.safeParse({ inlineEdit: true }).success).to.equal(
      true,
    );
    expect(
      TableViewSchema.safeParse({ inlineEdit: { columns: ["price"] } }).success,
    ).to.equal(true);
    expect(
      TableViewSchema.safeParse({ inlineEdit: { columns: "price" } }).success,
    ).to.equal(false);
  });
});
