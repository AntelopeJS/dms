import { Controller } from "@antelopejs/interface-api";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
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
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import {
  Column,
  TableView,
  type TableViewOptionsSerialized,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

const TABLE = "form-slot-notes";
const EDIT_SLOT = "test.notes-edit";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Note extends Table {
  @Field("string") declare title: string;
}

class NoteModel extends BasicDataModel(Note, TABLE) {}

@RegisterDataController()
class NoteAPI extends DataController(
  Note,
  {
    get: TableViewRoutes.Get,
    new: TableViewRoutes.New,
    edit: TableViewRoutes.Edit,
  },
  Controller("/api/form-slot-notes"),
) {
  @ModelReference()
  @Model(NoteModel)
  declare model: NoteModel;
  @Column({ name: "Title", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare title: string;
}

function formSlotIds(
  table: ReturnType<typeof TableView>,
): Record<string, unknown> {
  const options = table.serializeSync().options as TableViewOptionsSerialized;
  return Object.fromEntries(
    Object.entries(options.formComponents).map(([kind, form]) => [
      kind,
      (form?.options as { slotId?: string } | undefined)?.slotId,
    ]),
  );
}

describe("[unit] interfaces/dms-base — table view form slots", () => {
  it("opens the declared slot on the matching generated form only", () => {
    const table = TableView(NoteAPI, {
      formSlots: { edit: EDIT_SLOT },
      realtime: false,
    });

    expect(formSlotIds(table)).to.deep.equal({
      new: undefined,
      edit: EDIT_SLOT,
      view: undefined,
    });
  });

  it("opens no slot unless one is declared", () => {
    const table = TableView(NoteAPI, { realtime: false });

    expect(formSlotIds(table)).to.deep.equal({
      new: undefined,
      edit: undefined,
      view: undefined,
    });
  });
});
