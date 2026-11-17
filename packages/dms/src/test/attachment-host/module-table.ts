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
import {
  PageController,
  RegisterModule,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

const MODULE_ID = "module-table-host";
const TABLE = "module-table-notes";

RegisterModule({
  id: MODULE_ID,
  title: "Module table host",
  description: "A module whose page serves a table",
  icon: "i-ph-cube",
});

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class ModuleNote extends Table {
  @Field("string") declare title: string;
}

class ModuleNoteModel extends BasicDataModel(ModuleNote, TABLE) {}

@RegisterDataController()
export class ModuleNoteController extends DataController(
  ModuleNote,
  TableViewRoutes.All,
  Controller("/api/module-table/notes"),
) {
  @ModelReference()
  @Model(ModuleNoteModel)
  declare model: ModuleNoteModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Column({ name: "Title", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare title: string;
}

@RegisterPage()
export class ModuleNotesPage extends PageController("module-notes", {
  displayName: "Module notes",
  module: MODULE_ID,
}) {
  static content = TableView(ModuleNoteController, {
    realtime: false,
    rowActions: { add: true },
  });
}
