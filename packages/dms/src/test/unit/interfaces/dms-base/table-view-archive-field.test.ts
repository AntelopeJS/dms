import { Controller } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { DataController } from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  DataAPIMeta,
} from "@antelopejs/interface-data-api/metadata";
import {
  Field,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { ArchiveField } from "@antelopejs/interface-dms/base/table-view";
import { expect } from "chai";

@RegisterTable("archive-field-test", CORE_SCHEMA_NAME)
class ArchiveFieldRow extends Table {
  @Field("boolean") declare isArchived?: boolean;
  @Field("boolean") declare isClosed?: boolean;
}

class ArchiveFieldController extends DataController(
  ArchiveFieldRow,
  {},
  Controller("/archive-field-test"),
) {
  @ArchiveField()
  declare isArchived: boolean;

  @ArchiveField()
  @Access(AccessMode.ReadWrite)
  declare isClosed: boolean;
}

describe("[unit] interfaces/dms-base/table-view — the archive field", () => {
  const meta = GetMetadata(ArchiveFieldController, DataAPIMeta);
  const readable = meta.readable._default.props.map(([key]) => key);

  it("is read into the rows without an access of its own", () => {
    expect(meta.fields.isArchived?.mode).to.equal(AccessMode.ReadOnly);
    expect(readable).to.include("isArchived");
    expect([...(meta.pluck.list ?? [])]).to.include("isArchived");
  });

  it("keeps the access a field declares", () => {
    expect(meta.fields.isClosed?.mode).to.equal(AccessMode.ReadWrite);
  });
});
