import { expect } from "chai";
import {
  bucketExpression,
  emitPlan,
  readBucketExpression,
  type QueryPlan,
} from "../../../implementations/dms-builder/engine";
import type { ResourceFieldStructure } from "@antelopejs/interface-dms-builder";

function field(name: string, dataType: string): ResourceFieldStructure {
  return { name, dataType: { $dataType: dataType } };
}

const FIELDS = [
  field("amount", "number"),
  field("status", "string"),
  field("createdAt", "date"),
];

function body(plan: QueryPlan): string {
  return emitPlan(plan, FIELDS).body;
}

const COUNT = { kind: "count" } as const;
const SUM_AMOUNT = { kind: "aggregate", op: "sum", field: "amount" } as const;

/**
 * The grouped form of a plan: one point per group, which is what a chart, a KPI
 * with a breakdown and a top N all read. The chain shapes asserted here are the
 * ones checked against a real PostgreSQL and a real MongoDB before being written
 * into the emitter.
 */
describe("a grouped query plan", () => {
  it("groups by a field's own value without projecting anything", () => {
    expect(
      body({ filters: [], measure: COUNT, group: { field: "status" } }),
    ).to.equal(
      '{\n  return this.table\n    .group("status", (rows, group) => ' +
        "({ x: group, y: rows.count() }));\n}",
    );
  });

  it("measures an aggregate inside each group", () => {
    expect(
      body({ filters: [], measure: SUM_AMOUNT, group: { field: "status" } }),
    ).to.contain('y: rows.sum("amount")');
  });

  it("projects a month bucket before grouping on it", () => {
    const text = body({
      filters: [],
      measure: SUM_AMOUNT,
      group: { field: "createdAt", bucket: "month" },
    });

    expect(text).to.contain(
      '.map((row) => ({\n      bucket: row.key("createdAt").year().mul(100)' +
        '.add(row.key("createdAt").month()),\n      value: row.key("amount"),' +
        "\n    }))",
    );
    expect(text).to.contain(
      '.group("bucket", (rows, group) => ({ x: group, y: rows.sum("value") }))',
    );
  });

  it("omits the measured field from the projection for a count", () => {
    const text = body({
      filters: [],
      measure: COUNT,
      group: { field: "createdAt", bucket: "month" },
    });
    expect(text).to.contain(".map((row) => ({\n      bucket: ");
    expect(text, "nothing to carry along").to.not.contain("value:");
  });

  it("computes the bucket in the zone it was given", () => {
    const text = body({
      filters: [],
      measure: COUNT,
      group: {
        field: "createdAt",
        bucket: "year",
        timezone: "Europe/Brussels",
      },
    });
    expect(text).to.contain('row.key("createdAt").year("Europe/Brussels")');
  });

  it("renders each period as one ordered number", () => {
    const at = (bucket: "day" | "week" | "month" | "quarter" | "year") =>
      body({
        filters: [],
        measure: COUNT,
        group: { field: "createdAt", bucket },
      });

    expect(at("year"), "2026").to.contain(
      'bucket: row.key("createdAt").year()',
    );
    expect(at("month"), "202601").to.contain(".year().mul(100).add(");
    expect(at("day"), "20260114").to.contain(
      '.mul(100).add(row.key("createdAt").day())',
    );
    expect(at("week"), "days of its Monday").to.contain(
      'row.key("createdAt").dayofweek()',
    );
    expect(at("quarter"), "20261").to.contain(
      '.year().mul(10).add(row.key("createdAt").month().sub(1).div(3).floor().add(1))',
    );
  });

  it("orders by the group for a timeline and by the measure for a ranking", () => {
    expect(
      body({
        filters: [],
        measure: COUNT,
        group: { field: "createdAt", bucket: "month" },
        order: { by: "group", direction: "asc" },
      }),
    ).to.contain('.orderBy("x", "asc")');

    expect(
      body({
        filters: [],
        measure: SUM_AMOUNT,
        group: { field: "status" },
        order: { by: "measure", direction: "desc" },
      }),
    ).to.contain('.orderBy("y", "desc")');
  });

  it("keeps only the first points of a ranking", () => {
    const text = body({
      filters: [],
      measure: SUM_AMOUNT,
      group: { field: "status" },
      order: { by: "measure", direction: "desc" },
      limit: 5,
    });
    expect(text).to.contain('.orderBy("y", "desc")\n    .slice(0, 5);');
  });

  it("filters the rows before it groups them", () => {
    const text = body({
      filters: [{ field: "status", op: "eq", value: "paid" }],
      measure: SUM_AMOUNT,
      group: { field: "createdAt", bucket: "month" },
    });
    expect(text.indexOf(".filter("), "the filter comes first").to.be.lessThan(
      text.indexOf(".map("),
    );
  });

  it("binds a period the route supplies, as the scalar plans do", () => {
    const chain = emitPlan(
      {
        filters: [
          { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
          { field: "createdAt", op: "le", value: { $param: { name: "to" } } },
        ],
        measure: SUM_AMOUNT,
        group: { field: "createdAt", bucket: "month" },
      },
      FIELDS,
    );

    expect(chain.parameters.map((param) => param.routeName)).to.deep.equal([
      "from",
      "to",
    ]);
    expect(chain.body).to.contain("minCreatedAt");
  });
});

describe("the week bucket text", () => {
  it("reads back from the text it was written as", () => {
    const text = bucketExpression(
      { field: "createdAt", bucket: "week" },
      "row",
    );
    expect(readBucketExpression(text, "row", "createdAt")).to.equal("week");
  });
});
