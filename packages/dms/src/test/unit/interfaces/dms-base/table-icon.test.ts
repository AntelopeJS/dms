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
  Column,
  TableIcon,
  TableView,
  TableViewMeta,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base/table-view";

// `@TableIcon` on a data controller: the table views over it draw with that
// icon, and one without keeps the generic table icon.

const TABLE = "table-icon-contacts";
const CONTACTS_ICON = "i-ph-address-book";
const ARCHIVE_ICON = "i-ph-archive-box";
const GENERIC_TABLE_ICON = "i-ph-table";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Contact extends Table {
  @Field("string") declare name: string;
}

class ContactModel extends BasicDataModel(Contact, TABLE) {}

@TableIcon(CONTACTS_ICON)
class ContactAPI extends DataController(
  Contact,
  { list: TableViewRoutes.List },
  Controller("/api/table-icon-contacts"),
) {
  @ModelReference()
  @Model(ContactModel)
  declare model: ContactModel;

  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare name: string;
}

class PlainAPI extends DataController(
  Contact,
  { list: TableViewRoutes.List },
  Controller("/api/table-icon-plain"),
) {
  @ModelReference()
  @Model(ContactModel)
  declare model: ContactModel;

  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadOnly)
  declare name: string;
}

class DerivedAPI extends DataController(
  Contact,
  {},
  Controller("/api/table-icon-derived", ContactAPI),
) {}

@TableIcon(ARCHIVE_ICON)
class ArchiveAPI extends DataController(
  Contact,
  {},
  Controller("/api/table-icon-archive", ContactAPI),
) {}

describe("[unit] interfaces/dms-base — TableIcon", () => {
  it("draws the table views over a controller with its icon", () => {
    expect(GetMetadata(ContactAPI, TableViewMeta).icon).to.equal(CONTACTS_ICON);
    expect(TableView(ContactAPI, { realtime: false }).metadata.icon).to.equal(
      CONTACTS_ICON,
    );
  });

  it("keeps the generic table icon for a controller that declares none", () => {
    expect(GetMetadata(PlainAPI, TableViewMeta).icon).to.equal(undefined);
    expect(TableView(PlainAPI, { realtime: false }).metadata.icon).to.equal(
      GENERIC_TABLE_ICON,
    );
  });

  it("passes the icon to a derived controller, which may declare its own", () => {
    expect(GetMetadata(DerivedAPI, TableViewMeta).icon).to.equal(CONTACTS_ICON);
    expect(GetMetadata(ArchiveAPI, TableViewMeta).icon).to.equal(ARCHIVE_ICON);
    expect(GetMetadata(ContactAPI, TableViewMeta).icon).to.equal(CONTACTS_ICON);
  });
});
