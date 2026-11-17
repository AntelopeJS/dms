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
import { GetMetadata } from "@antelopejs/interface-core";
import { expect } from "chai";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { isFieldGroup } from "@antelopejs/interface-dms/base/form-types";
import {
  Column,
  ColumnGroup,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view/meta";
import { TableViewRoutes } from "@antelopejs/interface-dms/base/table-view/routes";

const SCHEMA = "table-view-group-keys-test";
const TABLE = "tickets";

@RegisterTable(TABLE, SCHEMA)
class Ticket extends Table {
  @Field("string")
  declare title: string;
  @Field("string")
  declare owner: string;
}
class TicketModel extends BasicDataModel(Ticket, TABLE) {}

@ColumnGroup("people", { label: "People", order: 2 })
@RegisterDataController()
class TicketAPI extends DataController(
  Ticket,
  TableViewRoutes.All,
  Controller("/table-view-group-keys-test"),
) {
  @ModelReference()
  @Model(TicketModel)
  declare model: TicketModel;

  @Column({
    name: "Title",
    type: new DefaultDataTypes.StringType(),
    group: "constructor",
  })
  @Access(AccessMode.ReadWrite)
  declare title: string;

  @Column({
    name: "Owner",
    type: new DefaultDataTypes.StringType(),
    group: "people",
  })
  @Access(AccessMode.ReadWrite)
  declare owner: string;
}

describe("[unit] interfaces/dms-base — column group keys", () => {
  const groups = GetMetadata(TicketAPI, TableViewMeta)
    .getFormFields("edit")
    .filter(isFieldGroup);

  it("labels a group by its declaration", () => {
    const people = groups.find((group) => group.id === "people");
    expect(people?.label).to.equal("People");
    expect(people?.order).to.equal(2);
  });

  it("treats a group named like an Object.prototype key as undeclared", () => {
    const inherited = groups.find((group) => group.id === "constructor");
    expect(inherited?.label).to.equal("constructor");
    expect(inherited?.description).to.equal(undefined);
    expect(inherited?.orientation).to.equal(undefined);
    expect(inherited?.order).to.equal(undefined);
  });
});
