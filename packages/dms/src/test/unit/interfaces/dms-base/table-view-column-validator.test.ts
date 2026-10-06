// The data-api entry first: `components` and the entry require each other,
// and loading `components` first leaves the entry reading it half built.
import { DataController } from "@antelopejs/interface-data-api";
import { Controller } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { Validation } from "@antelopejs/interface-data-api/components";
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
import { expect } from "chai";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { Column } from "@antelopejs/interface-dms/base/table-view";

// A `@Column` validates a written value with its data type's schema and hands
// the data API the parsed value, which is what gets stored.

const TABLE = "column-validator-events";

@RegisterTable(TABLE, CORE_SCHEMA_NAME)
class Event extends Table {
  @Field("string") declare name: string;
  @Field("date") declare startsAt: Date;
  @Field("object") declare period: unknown;
}

class EventAPI extends DataController(
  Event,
  {},
  Controller("/api/column-validator-events"),
) {
  @Column({ name: "Name", type: new DefaultDataTypes.StringType() })
  @Access(AccessMode.ReadWrite)
  declare name: string;

  @Column({ name: "Starts", type: new DefaultDataTypes.DateType() })
  @Access(AccessMode.ReadWrite)
  declare startsAt: Date;

  @Column({
    name: "Period",
    type: new DefaultDataTypes.DateType({ range: true }),
  })
  @Access(AccessMode.ReadWrite)
  declare period: unknown;
}

const meta = GetMetadata(EventAPI, DataAPIMeta);

describe("[unit] interfaces/dms-base — @Column validator", () => {
  it("returns the parse result, with a date sent as text parsed to a date", async () => {
    const result = await meta.fields.startsAt.validator!("2026-03-01");

    expect(result).to.deep.include({
      success: true,
      data: new Date("2026-03-01"),
    });
  });

  it("refuses a value its data type does not accept", async () => {
    const result = await meta.fields.startsAt.validator!("next tuesday");

    expect(result).to.include({ success: false });
  });

  it("lets the data API write the parsed values: dates, ranges and null", async () => {
    const parsed = await Validation.ValidateTypes(meta, {
      name: "Launch",
      startsAt: "2026-03-01T09:30:00.000Z",
      period: ["2026-03-01", "2026-03-31"],
    });

    expect(parsed).to.deep.equal({
      name: "Launch",
      startsAt: new Date("2026-03-01T09:30:00.000Z"),
      period: { start: new Date("2026-03-01"), end: new Date("2026-03-31") },
    });
    expect(
      await Validation.ValidateTypes(meta, { startsAt: null }),
    ).to.deep.equal({ startsAt: null });
  });
});
