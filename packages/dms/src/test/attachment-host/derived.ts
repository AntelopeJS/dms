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
import { Searchable } from "@antelopejs/interface-dms/base/searchable";
import {
  Column,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

// The same notes behind two writing screens: the second one goes through a
// controller derived from the first, at a location of its own.

const TABLE = "derived-controller-notes";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Note extends Table {
  @Field("string") declare title: string;
  @Field("string") declare file: string;
}

class NoteModel extends BasicDataModel(Note, TABLE) {}

@RegisterDataController()
export class BaseNoteController extends DataController(
  Note,
  TableViewRoutes.All,
  Controller("/api/derived-controller/base-notes"),
) {
  @ModelReference()
  @Model(NoteModel)
  declare model: NoteModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Searchable()
  @Listable()
  @Column({
    name: "Title",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
  })
  @Mandatory("new", "edit")
  @Access(AccessMode.ReadWrite)
  declare title: string;

  @Listable()
  @Column({ name: "File", type: new DefaultDataTypes.FileType() })
  @Access(AccessMode.ReadWrite)
  declare file: string;
}

// `@ModelReference()` again: interface-data-api 0.1.9 does not carry the model
// key over to a derived controller (the provider behind `@Model` is).
@RegisterDataController()
export class DerivedNoteController extends DataController(
  Note,
  {},
  Controller("/api/derived-controller/derived-notes", BaseNoteController),
) {
  @ModelReference()
  declare model: NoteModel;
}

@RegisterPage()
export class BaseNotesPage extends RootPageController("base-notes", {
  displayName: "Notes",
}) {
  static content = TableView(BaseNoteController, { realtime: false });
}

@RegisterPage()
export class DerivedNotesPage extends RootPageController("derived-notes", {
  displayName: "Notes, second screen",
}) {
  static content = TableView(DerivedNoteController, { realtime: false });
}
