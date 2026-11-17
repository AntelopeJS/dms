import { Controller } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { DataController } from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  DataAPIMeta,
  Filter,
} from "@antelopejs/interface-data-api/metadata";
import {
  Field,
  RegisterTable,
  Table,
} from "@antelopejs/interface-database-decorators";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import {
  ArchiveField,
  TableView,
} from "@antelopejs/interface-dms/base/table-view";
import { filterArchiveField } from "@antelopejs/interface-dms/base/table-view/internal/archive-filter";
import { ValueProxy } from "@antelopejs/interface-database";
import { assert, expect } from "chai";
import { untouchedRequestContext } from "../../../helpers/request-context";

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

class OverriddenArchiveController extends DataController(
  ArchiveFieldRow,
  {},
  Controller("/archive-field-override-test"),
) {
  @Filter()
  @ArchiveField()
  declare isArchived: boolean;
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

  it("serves a table view on the filter it registers", () => {
    expect(() => TableView(ArchiveFieldController)).not.to.throw();
  });

  it("refuses a table view whose archive field another Filter serves", () => {
    expect(() => TableView(OverriddenArchiveController)).to.throw(
      /archive field "isArchived" .* declares its own Filter/,
    );
  });

  describe("its filter", () => {
    /** The query stages the archive filter builds for one value and mode. */
    function stagesOf(value: string | boolean, mode: string): string {
      const result = filterArchiveField(
        untouchedRequestContext(),
        ValueProxy.arg<unknown>(0),
        "isArchived",
        value,
        mode,
      );
      assert.instanceOf(result, ValueProxy);
      return JSON.stringify(result.build());
    }

    it("compares a boolean a server caller passes as its text (fails when a boolean value is refused or read otherwise)", () => {
      expect(stagesOf(true, "eq")).to.equal(stagesOf("true", "eq"));
      expect(stagesOf(false, "ne")).to.equal(stagesOf("false", "ne"));
      expect(stagesOf(true, "eq")).not.to.equal(stagesOf("false", "eq"));
    });
  });
});
