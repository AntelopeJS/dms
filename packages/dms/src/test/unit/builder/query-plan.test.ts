import { expect } from "chai";
import {
  emitPlan,
  planFilters,
} from "../../../implementations/dms-builder/engine";
import type { ResourceFieldStructure } from "@antelopejs/interface-dms-builder";

/**
 * A field as the plan reads it. The emitter only ever asks for the DataType, from
 * which it resolves the TS type a literal is rendered as and a bound parameter is
 * typed with.
 */
function field(name: string, dataType: string): ResourceFieldStructure {
  return { name, dataType: { $dataType: dataType } };
}

const FIELDS = [
  field("amount", "number"),
  field("status", "string"),
  field("createdAt", "date"),
  field("archived", "boolean"),
  field("rating", "unmapped-type"),
];

function rendersTheMeasureAndFilters(): void {
  it("counts every row when nothing is filtered", () => {
    const chain = emitPlan({ filters: [], measure: { kind: "count" } }, FIELDS);
    expect(chain.body).to.equal("{\n  return this.table.count();\n}");
    expect(chain.parameters).to.deep.equal([]);
  });

  it("renders an aggregate over a named field", () => {
    const chain = emitPlan(
      {
        filters: [],
        measure: { kind: "aggregate", op: "sum", field: "amount" },
      },
      FIELDS,
    );
    expect(chain.body).to.equal('{\n  return this.table.sum("amount");\n}');
  });

  it("chains one filter call per condition, in order", () => {
    const chain = emitPlan(
      {
        filters: [
          { field: "status", op: "eq", value: "paid" },
          { field: "amount", op: "gt", value: 10 },
        ],
        measure: { kind: "count" },
      },
      FIELDS,
    );
    expect(chain.body).to.equal(
      '{\n  return this.table\n    .filter((row) => row.key("status").eq("paid"))' +
        '\n    .filter((row) => row.key("amount").gt(10))\n    .count();\n}',
    );
  });

  it("renders a literal in the field's own type", () => {
    const chain = emitPlan(
      {
        filters: [
          { field: "createdAt", op: "ge", value: "2026-01-01T00:00:00.000Z" },
          { field: "archived", op: "eq", value: false },
        ],
        measure: { kind: "count" },
      },
      FIELDS,
    );
    expect(
      chain.body,
      "a date literal is constructed, not compared as text",
    ).to.contain(
      'row.key("createdAt").ge(new Date("2026-01-01T00:00:00.000Z"))',
    );
    expect(chain.body).to.contain('row.key("archived").eq(false)');
  });
}

function bindsValuesAsParameters(): void {
  it("turns a bound value into a typed method parameter", () => {
    const chain = emitPlan(
      {
        filters: [
          {
            field: "amount",
            op: "lt",
            value: { $param: { name: "maxAmount" } },
          },
        ],
        measure: { kind: "count" },
      },
      FIELDS,
    );

    expect(
      chain.body,
      "the body reads the model's own parameter name",
    ).to.contain('row.key("amount").lt(maxAmount)');
    expect(chain.parameters).to.deep.equal([
      {
        name: "maxAmount",
        routeName: "maxAmount",
        type: "number",
        in: "query",
      },
    ]);
  });

  it("names a model parameter after what the filter means", () => {
    const chain = emitPlan(
      {
        filters: [
          { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
          { field: "createdAt", op: "le", value: { $param: { name: "to" } } },
        ],
        measure: { kind: "count" },
      },
      FIELDS,
    );

    expect(chain.parameters.map((param) => param.name)).to.deep.equal([
      "minCreatedAt",
      "maxCreatedAt",
    ]);
    expect(chain.parameters.map((param) => param.routeName)).to.deep.equal([
      "from",
      "to",
    ]);
    expect(chain.parameters.every((param) => param.type === "Date")).to.equal(
      true,
    );
  });

  it("reuses one parameter when two filters bind the same name", () => {
    const chain = emitPlan(
      {
        filters: [
          { field: "amount", op: "ge", value: { $param: { name: "bound" } } },
          { field: "amount", op: "le", value: { $param: { name: "bound" } } },
        ],
        measure: { kind: "count" },
      },
      FIELDS,
    );

    expect(chain.parameters).to.have.length(1);
    const [param] = chain.parameters;
    expect(
      chain.body.split(param.name).length - 1,
      "both filters read it",
    ).to.equal(2);
  });

  it("reads a path-bound value from the route's path segment", () => {
    const chain = emitPlan(
      {
        filters: [
          {
            field: "status",
            op: "eq",
            value: { $param: { name: "status", in: "param" } },
          },
        ],
        measure: { kind: "count" },
      },
      FIELDS,
    );
    expect(chain.parameters[0].in).to.equal("param");
  });
}

function warnsAndReadsTemplateFilters(): void {
  it("warns when a DataType has no mapping instead of guessing silently", () => {
    const chain = emitPlan(
      {
        filters: [{ field: "rating", op: "eq", value: "good" }],
        measure: { kind: "count" },
      },
      FIELDS,
    );

    expect(chain.body, "an unmapped type compares as a string").to.contain(
      'row.key("rating").eq("good")',
    );
    expect(chain.warnings?.[0]?.code).to.equal("datatype_fallback");
  });

  it("reads a template's where parameter as the plan's filters", () => {
    expect(planFilters(undefined)).to.deep.equal([]);
    expect(planFilters("not an array")).to.deep.equal([]);
    expect(
      planFilters([
        { field: "status", op: "eq", value: "paid", extra: "ignored" },
      ]),
    ).to.deep.equal([{ field: "status", op: "eq", value: "paid" }]);
  });

  it("refuses an entry that is not a filter instead of reading it as one", () => {
    const entries = [
      null,
      "paid",
      { field: "status", op: "eq" },
      { field: 5, op: "eq", value: 1 },
      { field: "status", op: "like", value: "a" },
      { field: "status", op: 5, value: "a" },
    ];
    for (const entry of entries) {
      expect(
        () => planFilters([entry]),
        `${JSON.stringify(entry)} is no filter`,
      ).to.throw(/planned before it was validated/);
    }
  });
}

/**
 * The plan is the description three backends share, so what it renders is
 * asserted directly rather than only through a written file: these cases run in
 * milliseconds and cover the shapes a full round-trip would take a typecheck to
 * reach.
 */
describe("the query plan", () => {
  rendersTheMeasureAndFilters();
  bindsValuesAsParameters();
  warnsAndReadsTemplateFilters();
});
