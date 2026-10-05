import { Controller } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { DataController } from "@antelopejs/interface-data-api";
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
  Searchable,
  SearchableMeta,
} from "@antelopejs/interface-dms/base/searchable";
import {
  ArchiveField,
  Column,
  ColumnGroup,
  TableView,
  TableViewMeta,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

// `class B extends DataController(T, {}, Controller("/b", A))`: B starts with
// what A declares about its columns, and keeps its own TableViews.

const TABLE = "meta-inherit-documents";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Document extends Table {
  @Field("string") declare name: string;
  @Field("string") declare file: string;
  @Field("string") declare note: string;
  @Field("boolean") declare isArchived: boolean;
}

class DocumentModel extends BasicDataModel(Document, TABLE) {}

@ColumnGroup("identity", { label: "Identity" })
class ParentAPI extends DataController(
  Document,
  { new: TableViewRoutes.New, edit: TableViewRoutes.Edit },
  Controller("/api/meta-inherit-parent"),
) {
  @ModelReference()
  @Model(DocumentModel)
  declare model: DocumentModel;

  @Searchable()
  @Column({
    name: "Name",
    type: new DefaultDataTypes.StringType(),
    group: "identity",
  })
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Column({ name: "File", type: new DefaultDataTypes.FileType() })
  @Access(AccessMode.ReadWrite)
  declare file: string;

  @ArchiveField()
  declare isArchived: boolean;
}

const parentTable = TableView(ParentAPI, {
  realtime: false,
  rowIdKey: "_id",
  archiveMode: true,
});

class ChildAPI extends DataController(
  Document,
  {},
  Controller("/api/meta-inherit-child", ParentAPI),
) {
  @Column({ name: "Note", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare note: string;
}

const parent = GetMetadata(ParentAPI, TableViewMeta);
const child = GetMetadata(ChildAPI, TableViewMeta);

describe("[unit] interfaces/dms-base — TableViewMeta.inherit", () => {
  it("starts a derived controller with its parent's columns, groups, options and archive field", () => {
    expect(Object.keys(child.columns)).to.have.members([
      "name",
      "file",
      "note",
    ]);
    expect(child.columns.name.name).to.equal("Name");
    expect(child.groups.identity).to.deep.equal({ label: "Identity" });
    expect(child.options.archiveMode).to.equal(true);
    expect(child.archiveField).to.equal("isArchived");
  });

  it("leaves the parent's columns alone when the derived controller declares more", () => {
    expect(Object.keys(parent.columns)).to.have.members(["name", "file"]);
  });

  it("gives each controller its own copy of a column's type", () => {
    expect(child.columns.file.type).to.be.instanceOf(DefaultDataTypes.FileType);
    expect(child.columns.file.type).to.not.equal(parent.columns.file.type);
    TableView(ChildAPI, { realtime: false });
    expect(parent.columns.file.type.options?.attachmentField).to.equal(
      "/api/meta-inherit-parent#file",
    );
    expect(child.columns.file.type.options?.attachmentField).to.equal(
      "/api/meta-inherit-child#file",
    );
  });

  it("keeps the parent's TableViews to the parent", () => {
    expect(parent.componentBuilders).to.include(parentTable);
    expect(child.componentBuilders).to.not.include(parentTable);
  });

  it("searches the parent's searchable fields", () => {
    expect(
      GetMetadata(ChildAPI, SearchableMeta).getSearchableFields(),
    ).to.deep.equal({ name: "contains" });
  });
});
