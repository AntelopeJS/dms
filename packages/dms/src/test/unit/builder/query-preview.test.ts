import { expect } from "chai";
import {
  previewInstance,
  previewRequestFromSearch,
  runPlanPreview,
} from "../../../implementations/dms-builder/engine/query-preview";
import type {
  PlanPoints,
  PlanStream,
} from "../../../implementations/dms-builder/engine/query-plan-execute";
import { registerBuiltinQueryTemplates } from "../../../implementations/dms-builder/engine/query-template-emit";
import type {
  QueryPoint,
  ResourceFieldStructure,
} from "@antelopejs/interface-dms-builder";

function field(name: string, dataType: string): ResourceFieldStructure {
  return { name, dataType: { $dataType: dataType } };
}

const FIELDS = [
  field("amount", "number"),
  field("status", "string"),
  field("createdAt", "date"),
];

/** What a table answers once awaited: a number for a scalar plan, one point per group for a grouped one. */
type Answer = number | QueryPoint[];

/** How awaiting a handle settles, as the test decided. */
type Outcome<Result> = (
  resolve: (answer: Result) => void,
  reject: (error: Error) => void,
) => void;

function awaitable<Result>(outcome: Outcome<Result>): Promise<Result> {
  const settling = new Promise<Result>(outcome);
  settling.catch(() => undefined);
  return settling;
}

/**
 * A table without a database. Every call the plan makes returns the same handle,
 * a measure over it settles as `total` decided and the groups it makes settle as
 * `groups` decided.
 */
function tableSettling(
  total: Outcome<number>,
  groups: Outcome<QueryPoint[]>,
): PlanStream {
  const grouped: PlanPoints = Object.assign(awaitable(groups), {
    orderBy: () => grouped,
    slice: () => grouped,
  });
  const handle: PlanStream = {
    filter: () => handle,
    map: () => handle,
    group: () => grouped,
    count: () => awaitable(total),
    sum: () => awaitable(total),
    avg: () => awaitable(total),
    min: () => awaitable(total),
    max: () => awaitable(total),
  };
  return handle;
}

function unasked(kind: string): Outcome<never> {
  return (_resolve, reject) =>
    reject(
      new Error(`the table was awaited for ${kind}, which it was not given`),
    );
}

/** A table that answers whatever the test decided. */
function tableAnswering(rows: Answer): PlanStream {
  return Array.isArray(rows)
    ? tableSettling(unasked("a figure"), (resolve) => resolve(rows))
    : tableSettling((resolve) => resolve(rows), unasked("points"));
}

function failingTable(message: string): PlanStream {
  const refusal: Outcome<never> = (_resolve, reject) =>
    reject(new Error(message));
  return tableSettling(refusal, refusal);
}

const COUNT_QUERY = {
  name: "orderCount",
  resource: "order",
  template: "count",
};

const MONTHLY = {
  name: "monthly",
  resource: "order",
  template: "series",
  params: { op: "sum", field: "amount", groupBy: "createdAt", bucket: "month" },
};

/** The same source, arranged for the card that reads it. */
const MONTHLY_CARD = { ...MONTHLY, response: "card" as const };

/**
 * What a block is shown for a source that has not been written. The calculation
 * itself is covered elsewhere; this is about what the preview says back — its
 * shape, where it stops, and how it refuses.
 */
describe("previewing a query", () => {
  before(() => registerBuiltinQueryTemplates());

  it("answers a number for a scalar query", async () => {
    const result = await runPlanPreview(
      tableAnswering(42),
      { query: COUNT_QUERY },
      FIELDS,
    );

    expect(result.ok).to.equal(true);
    if (result.ok) {
      expect(result.data.output).to.equal("scalar");
      expect(result.data.body, "the envelope the route serves").to.deep.equal({
        value: 42,
      });
      expect(result.changes, "a preview writes nothing").to.deep.equal([]);
    }
  });

  it("answers points for a series, in the shape a chart reads", async () => {
    const rows = [
      { x: 202601, y: 150 },
      { x: 202602, y: 30 },
    ];
    const result = await runPlanPreview(
      tableAnswering(rows),
      { query: MONTHLY },
      FIELDS,
    );

    expect(result.ok).to.equal(true);
    if (result.ok) {
      expect(result.data.output).to.equal("series");
      expect(result.data.response, "nothing arranged them").to.equal(undefined);
      expect(result.data.body).to.deep.equal({ series: rows });
      expect(result.data.truncated).to.equal(false);
    }
  });

  it("arranges the points the way the route would, when asked for a card", async () => {
    const rows = [
      { x: 202601, y: 150 },
      { x: 202602, y: 30 },
    ];
    const result = await runPlanPreview(
      tableAnswering(rows),
      { query: MONTHLY_CARD },
      FIELDS,
    );

    expect(result.ok).to.equal(true);
    if (result.ok) {
      expect(
        result.data.response,
        "the same arrangement read-back reports",
      ).to.equal("card");
      expect(result.data.body).to.have.property("value", 180);
      expect(result.data.body)
        .to.have.property("series")
        .that.does.not.deep.equal(rows);
    }
  });

  for (const response of [
    "constructor",
    "toString",
    "hasOwnProperty",
    "bogus",
  ]) {
    it(`reads a response named ${response} as the default series arrangement`, async () => {
      const rows = [
        { x: 202601, y: 150 },
        { x: 202602, y: 30 },
      ];
      const request = previewRequestFromSearch(
        new URLSearchParams({
          query: JSON.stringify({ ...MONTHLY, response }),
        }),
        "query",
        undefined,
      );
      expect(request.ok).to.equal(true);
      if (!request.ok) {
        return;
      }
      const result = await runPlanPreview(
        tableAnswering(rows),
        request.data,
        FIELDS,
      );

      expect(result.ok).to.equal(true);
      if (result.ok) {
        expect(result.data.response, "nothing arranged them").to.equal(
          undefined,
        );
        expect(result.data.body).to.deep.equal({ series: rows });
      }
    });
  }

  it("answers the period before too, when the card compares against it", async () => {
    const rows = [
      { x: 202601, y: 150 },
      { x: 202602, y: 30 },
    ];
    const compared = {
      ...MONTHLY_CARD,
      params: {
        ...MONTHLY.params,
        where: [
          { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
          { field: "createdAt", op: "le", value: { $param: { name: "to" } } },
        ],
      },
      compare: true,
    };
    const bounds = { from: "2026-02-01", to: "2026-02-28" };
    const preceding = { compareFrom: "2026-01-01", compareTo: "2026-01-31" };

    const result = await runPlanPreview(
      tableAnswering(rows),
      { query: compared, args: { ...bounds, ...preceding } },
      FIELDS,
    );
    expect(result.ok).to.equal(true);
    if (result.ok) {
      expect(
        result.data.body,
        "the preceding period's headline, as the route would answer it",
      ).to.have.property("previousValue", 180);
      expect(result.data.body)
        .to.have.property("comparisonSeries")
        .that.is.an("array");
    }

    const alone = await runPlanPreview(
      tableAnswering(rows),
      { query: compared, args: bounds },
      FIELDS,
    );
    expect(alone.ok).to.equal(true);
    if (alone.ok) {
      expect(
        alone.data.body,
        "no comparison bounds, no period before to read",
      ).to.not.have.property("previousValue");
    }
  });

  it("stops reading rather than answering a million points, and says so", async () => {
    const rows = Array.from({ length: 900 }, (_, index) => ({
      x: index,
      y: index,
    }));
    const result = await runPlanPreview(
      tableAnswering(rows),
      { query: MONTHLY },
      FIELDS,
    );

    expect(result.ok).to.equal(true);
    if (result.ok) {
      expect(result.data.body).to.have.property("series").with.length(500);
      expect(result.data.truncated).to.equal(true);
    }
  });

  it("refuses parameters the calculation could not run, before touching the table", async () => {
    const result = await runPlanPreview(
      tableAnswering(0),
      {
        query: {
          ...MONTHLY,
          params: { ...MONTHLY.params, field: "status" },
        },
      },
      FIELDS,
    );

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.error.code).to.equal("invalid_config");
    }
  });

  it("refuses a parameter the template does not declare, as AddQuery does", async () => {
    const result = await runPlanPreview(
      tableAnswering(18),
      { query: { ...COUNT_QUERY, params: { bogus: 1 } } },
      FIELDS,
    );

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(result.error).to.deep.equal({
        code: "invalid_config",
        issues: [
          {
            pointer: "/bogus",
            message: 'template "count" declares no parameter "bogus"',
          },
        ],
      });
    }
  });

  it("refuses a template it does not know", async () => {
    const result = await runPlanPreview(
      tableAnswering(0),
      { query: { ...COUNT_QUERY, template: "nope" } },
      FIELDS,
    );
    expect(result.ok).to.equal(false);
  });

  it("reports what the database refused instead of throwing at the caller", async () => {
    const result = await runPlanPreview(
      failingTable("relation does not exist"),
      { query: COUNT_QUERY },
      FIELDS,
    );

    expect(result.ok).to.equal(false);
    if (!result.ok) {
      expect(JSON.stringify(result.error)).to.contain(
        "relation does not exist",
      );
    }
  });

  it("reads the instance the saved route's model would", () => {
    expect(previewInstance("dms-tenant", "acme")).to.equal("acme");
    expect(previewInstance("dms-builder-playground", "default")).to.equal(
      undefined,
    );
  });
});

/**
 * A card on the builder's canvas reads its unsaved source by address: the query
 * rides in one parameter, and the period it appends rides beside it.
 */
describe("a preview asked for by address", () => {
  const query = {
    name: "orders",
    resource: "order",
    template: "aggregate",
    params: { op: "count" },
    response: "card",
  };

  it("reads the query, and hands every other parameter to the route", () => {
    const search = new URLSearchParams({
      query: JSON.stringify(query),
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-30T00:00:00.000Z",
    });
    const result = previewRequestFromSearch(search, "query", "acme");

    expect(result.ok).to.equal(true);
    if (result.ok) {
      expect(result.data.query).to.deep.equal(query);
      expect(result.data.args).to.deep.equal({
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-30T00:00:00.000Z",
      });
      expect(result.data.tenant).to.equal("acme");
    }
  });

  it("runs a filter on a parameter named __proto__ the address supplied", async () => {
    const filtered = {
      ...query,
      template: "count",
      params: {
        where: [
          {
            field: "amount",
            op: "ge",
            value: { $param: { name: "__proto__" } },
          },
        ],
      },
    };
    const search = new URLSearchParams({ query: JSON.stringify(filtered) });
    search.append("__proto__", "7");
    const request = previewRequestFromSearch(search, "query", "acme");
    expect(request.ok).to.equal(true);
    if (!request.ok) {
      return;
    }
    const result = await runPlanPreview(
      tableAnswering(3),
      request.data,
      FIELDS,
    );

    expect(result).to.deep.include({ ok: true });
    expect(request.data.args).to.deep.equal(
      Object.fromEntries([["__proto__", "7"]]),
    );
  });

  it("refuses an address without a query it could run", () => {
    const missing = previewRequestFromSearch(
      new URLSearchParams(),
      "query",
      undefined,
    );
    const garbled = previewRequestFromSearch(
      new URLSearchParams({ query: "{not json" }),
      "query",
      undefined,
    );
    const nameless = previewRequestFromSearch(
      new URLSearchParams({ query: JSON.stringify({ resource: "order" }) }),
      "query",
      undefined,
    );

    for (const result of [missing, garbled, nameless]) {
      expect(result.ok).to.equal(false);
      if (!result.ok) {
        expect(result.error.code).to.equal("invalid_config");
      }
    }
  });
});
