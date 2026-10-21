import { Controller } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
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
import {
  Column,
  TableViewMeta,
} from "@antelopejs/interface-dms/base/table-view";
import { validateGroupedOptions } from "@antelopejs/interface-dms/base/table-view/internal/validation";

// A counted group is read with `filter_<column>`, which the count route
// ignores on a column without a filter: registration refuses it.

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

function validate(groupByField: string, count: boolean): void {
  validateGroupedOptions(
    "GroupedCountAPI",
    GetMetadata(GroupedCountAPI, TableViewMeta),
    { groupByField, count },
  );
}

describe("[unit] interfaces/dms-base/table-view — counted groups", () => {
  it("throws when the counted column is not filterable", () => {
    expect(() => validate("stage", true)).to.throw(/not filterable/);
  });

  it("accepts a filterable column, or groups not counted", () => {
    expect(() => validate("status", true)).to.not.throw();
    expect(() => validate("stage", false)).to.not.throw();
  });
});
