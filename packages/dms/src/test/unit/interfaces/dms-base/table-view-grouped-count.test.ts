import { Controller } from "@antelopejs/interface-api";
import { DataController } from "@antelopejs/interface-data-api";
import { Sortable } from "@antelopejs/interface-data-api/metadata";
import {
  Field,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Column, TableView } from "@antelopejs/interface-dms/base/table-view";
import { captureWarnings } from "../../../helpers/logging";

// A counted group is read with `filter_<column>`, which the count route
// ignores on a column without a filter: registration says so.

@RegisterTable("grouped-count-rows", CORE_SCHEMA_NAME)
class Row extends Table {
  @Field("string") declare status: string;
  @Field("string") declare stage: string;
}

class GroupedCountAPI extends DataController(
  Row,
  {},
  Controller("/api/grouped-count"),
) {
  @Sortable()
  @Column({
    name: "Status",
    type: new DefaultDataTypes.StringType(),
    filterable: true,
  })
  declare status: string;

  @Sortable()
  @Column({ name: "Stage", type: new DefaultDataTypes.StringType() })
  declare stage: string;
}

function warningsFor(groupByField: string, count: boolean): string[] {
  const captured = captureWarnings();
  try {
    TableView(GroupedCountAPI, {
      grouped: { groupByField, count },
      realtime: false,
    });
  } finally {
    captured.restore();
  }
  return captured.messages.filter((message) => message.includes("filterable"));
}

describe("[unit] interfaces/dms-base/table-view — counted groups", () => {
  it("warns when the counted column is not filterable", () => {
    expect(warningsFor("stage", true)).to.have.length(1);
  });

  it("stays silent for a filterable column, or groups not counted", () => {
    expect(warningsFor("status", true)).to.deep.equal([]);
    expect(warningsFor("stage", false)).to.deep.equal([]);
  });
});
