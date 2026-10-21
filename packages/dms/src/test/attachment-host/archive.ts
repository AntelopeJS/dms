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
  RegisterPage,
  RootPageController,
} from "@antelopejs/interface-dms/page";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  ArchiveField,
  Column,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

// Notes in archive mode. A note is created without its archive field, which
// only archive and restore write: the active list keeps it through the `ne`
// filter, the database adapter matching a missing field as "not archived".

const TABLE = "archive-notes";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
export class ArchiveNote extends Table {
  @Field("string") declare title: string;
  @Field("boolean") declare isArchived?: boolean;
}

export class ArchiveNoteModel extends BasicDataModel(ArchiveNote, TABLE) {}

@RegisterDataController()
export class ArchiveNoteController extends DataController(
  ArchiveNote,
  TableViewRoutes.All,
  Controller("/api/archive/notes"),
) {
  @ModelReference()
  @Model(ArchiveNoteModel)
  declare model: ArchiveNoteModel;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Column({ name: "Title", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare title: string;

  @ArchiveField()
  @Access(AccessMode.ReadOnly)
  declare isArchived: boolean;
}

@RegisterPage()
export class ArchiveNotesPage extends RootPageController("archive-notes", {
  displayName: "Notes",
}) {
  static content = TableView(ArchiveNoteController, {
    realtime: false,
    archiveMode: true,
    rowActions: { add: true },
  });
}
