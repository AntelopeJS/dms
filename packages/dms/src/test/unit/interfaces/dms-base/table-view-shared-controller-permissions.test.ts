import { Controller } from "@antelopejs/interface-api";
import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
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
import type { ComponentBuilder } from "@antelopejs/interface-dms/component";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import {
  TableView,
  TableViewMeta,
  type TableViewOptionsSerialized,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

const TABLE = "shared-controller-rows";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Row extends Table {}

@RegisterDataController()
class SharedAPI extends DataController(
  Row,
  { list: TableViewRoutes.List },
  Controller("/api/shared-controller-rows"),
) {}

/** A table view as a page leaves it once mounted: its actions stamped. */
function stampedBuilder(
  actions: Record<string, string | undefined>,
): ComponentBuilder<TableViewOptionsSerialized> {
  return {
    getAction: (id: string) =>
      id in actions ? { permissionId: actions[id] } : undefined,
  } as unknown as ComponentBuilder<TableViewOptionsSerialized>;
}

function metaWith(
  ...builders: ComponentBuilder<TableViewOptionsSerialized>[]
): TableViewMeta {
  class SomeController {}
  const meta = GetMetadata(SomeController, TableViewMeta);
  for (const builder of builders) meta.componentBuilder = builder;
  return meta;
}

describe("[unit] interfaces/dms-base/table-view — controllers shared by several tables", () => {
  it("keeps every table view built over a controller, the last one as componentBuilder", () => {
    const meta = GetMetadata(SharedAPI, TableViewMeta);
    const first = TableView(SharedAPI, { realtime: false });
    const second = TableView(SharedAPI, { realtime: false });
    expect(meta.componentBuilders).to.include.members([first, second]);
    expect(meta.componentBuilder).to.equal(second);
  });

  it("guards an action with the permission of each mounted table view", () => {
    const meta = metaWith(
      stampedBuilder({ list: "pages.a.table.list" }),
      stampedBuilder({ list: "pages.b.table.list" }),
    );
    expect(meta.actionPermissionIds("list")).to.deep.equal([
      "pages.a.table.list",
      "pages.b.table.list",
    ]);
  });

  it("ignores a table view no page mounted (unstamped) and repeats no id", () => {
    const meta = metaWith(
      stampedBuilder({ list: undefined }),
      stampedBuilder({ list: "pages.a.table.list" }),
      stampedBuilder({ list: "pages.a.table.list" }),
    );
    expect(meta.actionPermissionIds("list")).to.deep.equal([
      "pages.a.table.list",
    ]);
    expect(meta.actionPermissionIds("delete")).to.deep.equal([]);
  });

  it("counts a builder assigned twice once", () => {
    const builder = stampedBuilder({ list: "pages.a.table.list" });
    const meta = metaWith(builder, builder);
    expect(meta.componentBuilders).to.have.length(1);
  });

  describe("HasAnyPermission", () => {
    before(() => {
      ImplementInterface(permissionsInterface, permissionsImpl);
    });

    it("admits a caller holding the action on any one of the tables", async () => {
      const permissions = new Set(["pages.page-mode.table.list"]);
      expect(
        await permissionsInterface.HasAnyPermission(permissions, [
          "pages.page-extension.content.tasks.list",
          "pages.page-mode.table.list",
        ]),
      ).to.equal(true);
    });

    it("refuses a caller holding it on none of them", async () => {
      const permissions = new Set(["pages.other.table.list"]);
      expect(
        await permissionsInterface.HasAnyPermission(permissions, [
          "pages.page-extension.content.tasks.list",
          "pages.page-mode.table.list",
        ]),
      ).to.equal(false);
      expect(
        await permissionsInterface.HasAnyPermission(permissions, []),
      ).to.equal(false);
    });
  });
});
