import { expect } from "chai";
import { ListQueryTemplates } from "../../../implementations/dms-builder";
import {
  registerBuiltinQueryTemplates,
  runPlanPreview,
} from "../../../implementations/dms-builder/engine";
import type {
  AddQueryInput,
  ResourceFieldStructure,
} from "@antelopejs/interface-dms-builder";
import { rowTable, type TableRow } from "./helpers/row-table";

function field(name: string, dataType: string): ResourceFieldStructure {
  return { name, dataType: { $dataType: dataType } };
}

const FIELDS = [
  field("status", "string"),
  field("amount", "number"),
  field("createdAt", "date"),
];

const RENTED = { field: "status", op: "eq", value: "rented" };
const PAID = { field: "status", op: "eq", value: "paid" };

const PERIOD = [
  { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
  { field: "createdAt", op: "le", value: { $param: { name: "to" } } },
];

const RENTED_BIKES = {
  resource: "bike",
  template: "ratio",
  params: { numerator: { where: [RENTED] }, denominator: {} },
};

const IN_PERIOD = {
  ...RENTED_BIKES,
  params: {
    numerator: { where: [RENTED, ...PERIOD] },
    denominator: { where: PERIOD },
  },
  compare: true,
};

const JANUARY = { from: "2026-01-01", to: "2026-01-31" };
const FEBRUARY = { from: "2026-02-01", to: "2026-02-28" };
const BOTH_PERIODS = {
  ...FEBRUARY,
  compareFrom: JANUARY.from,
  compareTo: JANUARY.to,
};

function bike(status: string, createdAt: string, amount = 0): TableRow {
  return { status, amount, createdAt: new Date(createdAt) };
}

/** Four bikes in January, one rented. */
const JANUARY_BIKES = [
  bike("rented", "2026-01-05"),
  bike("free", "2026-01-10"),
  bike("free", "2026-01-15"),
  bike("free", "2026-01-20"),
];

/** Four bikes in February, two rented. */
const FEBRUARY_BIKES = [
  bike("rented", "2026-02-05"),
  bike("rented", "2026-02-10"),
  bike("free", "2026-02-15"),
  bike("free", "2026-02-20"),
];

const FLEET = [...JANUARY_BIKES, ...FEBRUARY_BIKES];

async function previewed(
  rows: TableRow[],
  query: Parameters<typeof runPlanPreview>[1]["query"],
  args?: Parameters<typeof runPlanPreview>[1]["args"],
) {
  const result = await runPlanPreview(rowTable(rows), { query, args }, FIELDS);
  if (!result.ok) {
    throw new Error(`the preview was refused: ${JSON.stringify(result.error)}`);
  }
  return result.data;
}

/**
 * A KpiCard with `valueFormat: "percent"` reads a fraction, so 1 bike rented of 4
 * has to arrive as 0.25: an implementation that scales it to 25 shows 2500 %.
 */
describe("previewing a ratio query", () => {
  before(() => registerBuiltinQueryTemplates());

  it("is offered as a template that answers a scalar", async () => {
    const ratio = (await ListQueryTemplates("database-table")).find(
      (template) => template.id === "ratio",
    );

    expect(ratio?.output).to.equal("scalar");
    expect(Object.keys(ratio?.params ?? {})).to.have.members([
      "numerator",
      "denominator",
    ]);
  });

  it("answers the fraction, 1 bike rented of 4 reading 0.25", async () => {
    const answer = await previewed(JANUARY_BIKES, RENTED_BIKES);

    expect(answer.output).to.equal("scalar");
    expect(answer.body).to.deep.equal({ value: 0.25 });
  });

  it("answers null, not 0 or NaN, when the denominator is 0", async () => {
    const answer = await previewed([], RENTED_BIKES);

    expect(answer.body).to.deep.equal({ value: null });
  });

  it("divides a sum by a sum when the sides measure a field", async () => {
    const answer = await previewed(
      [bike("paid", "2026-02-01", 30), bike("refunded", "2026-02-02", 10)],
      {
        ...RENTED_BIKES,
        params: {
          numerator: { op: "sum", field: "amount", where: [PAID] },
          denominator: { op: "sum", field: "amount" },
        },
      },
    );

    expect(answer.body).to.deep.equal({ value: 0.75 });
  });

  it("answers the fraction with its delta over the preceding period, binding the period on both sides", async () => {
    const answer = await previewed(FLEET, IN_PERIOD, BOTH_PERIODS);

    expect(answer.response).to.equal("value");
    expect(answer.body).to.deep.equal({
      value: 0.5,
      previousValue: 0.25,
      delta: 100,
    });
  });

  it("states no previous figure when the preceding period had no denominator", async () => {
    const answer = await previewed(FEBRUARY_BIKES, IN_PERIOD, BOTH_PERIODS);

    expect(answer.body).to.deep.equal({ value: 0.5 });
  });

  it("answers a plain value when no comparison bounds came with the request", async () => {
    const answer = await previewed(FLEET, IN_PERIOD, FEBRUARY);

    expect(answer.body).to.deep.equal({ value: 0.5 });
  });

  it("compares a count the same way, since the rule belongs to the scalar output", async () => {
    const answer = await previewed(
      FLEET,
      {
        resource: "bike",
        template: "count",
        params: { where: PERIOD },
        compare: true,
      },
      BOTH_PERIODS,
    );

    expect(answer.response).to.equal("value");
    expect(answer.body).to.deep.equal({
      value: 4,
      previousValue: 4,
      delta: 0,
    });
  });

  it("keeps a scalar that binds no period as the plain figure whatever compare says", async () => {
    const answer = await previewed(
      FLEET,
      { resource: "bike", template: "count", compare: true },
      BOTH_PERIODS,
    );

    expect(answer.response).to.equal(undefined);
    expect(answer.body).to.deep.equal({ value: 8 });
  });
});

/** What validating a ratio refuses, told by where in the parameters it points. */
async function refusedAt(params: NonNullable<AddQueryInput["params"]>) {
  const result = await runPlanPreview(
    rowTable([]),
    { query: { ...RENTED_BIKES, params } },
    FIELDS,
  );
  if (result.ok) {
    throw new Error("the ratio was previewed, not refused");
  }
  const { error } = result;
  return "issues" in error ? error.issues.map((found) => found.pointer) : [];
}

describe("refusing a ratio that could not run", () => {
  before(() => registerBuiltinQueryTemplates());

  it("refuses to sum a field that is not a number, pointing into the side", async () => {
    expect(
      await refusedAt({
        numerator: { op: "sum", field: "status" },
        denominator: {},
      }),
    ).to.deep.equal(["/numerator/field"]);
  });

  it("refuses a field on a side that counts, since a count reads none", async () => {
    expect(
      await refusedAt({
        numerator: {},
        denominator: { field: "amount" },
      }),
    ).to.deep.equal(["/denominator/field"]);
  });

  it("refuses an op that is neither count nor sum", async () => {
    expect(
      await refusedAt({
        numerator: { op: "avg", field: "amount" },
        denominator: {},
      }),
    ).to.deep.equal(["/numerator/op"]);
  });

  it("points a bad filter at its place inside the side", async () => {
    expect(
      await refusedAt({
        numerator: { where: [{ field: "nope", op: "eq", value: 1 }] },
        denominator: {},
      }),
    ).to.deep.equal(["/numerator/where/0/field"]);
  });

  it("refuses a parameter the two sides bind as different types", async () => {
    expect(
      await refusedAt({
        numerator: {
          where: [
            {
              field: "createdAt",
              op: "ge",
              value: { $param: { name: "from" } },
            },
          ],
        },
        denominator: {
          where: [
            { field: "amount", op: "ge", value: { $param: { name: "from" } } },
          ],
        },
      }),
    ).to.deep.equal(["/denominator/where/0/value/$param"]);
  });

  it("refuses a parameter the two sides bind from different sources", async () => {
    expect(
      await refusedAt({
        numerator: {
          where: [
            {
              field: "createdAt",
              op: "ge",
              value: { $param: { name: "from" } },
            },
          ],
        },
        denominator: {
          where: [
            {
              field: "createdAt",
              op: "ge",
              value: { $param: { name: "from", in: "param" } },
            },
          ],
        },
      }),
    ).to.deep.equal(["/denominator/where/0/value/$param"]);
  });

  it("refuses a missing side and a parameter a side does not declare", async () => {
    expect(await refusedAt({ numerator: {} })).to.deep.equal(["/denominator"]);
    expect(
      await refusedAt({ numerator: { bogus: 1 }, denominator: {} }),
    ).to.deep.equal(["/numerator/bogus"]);
  });

  it("refuses an expression in a side, which would put code in the model", async () => {
    expect(
      await refusedAt({
        numerator: {
          where: [{ field: "status", op: "eq", value: { $expr: "x" } }],
        },
        denominator: {},
      }),
    ).to.include("/numerator/where/0/value");
  });
});
