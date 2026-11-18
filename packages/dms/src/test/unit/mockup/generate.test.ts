import Ajv2020 from "ajv/dist/2020";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import { z } from "zod";
import {
  compileSpec,
  type Json,
  type JsonObject,
  mockupNameSchema,
  parseSpec,
} from "../../../mockup";
import {
  MOCKUP_API as BASE,
  serveMockupRoutes,
} from "../../helpers/mockup-routes";
import { MOCKUP_SPEC_SCHEMA } from "../../helpers/mockup-spec-schema";

const DEMO = mockupNameSchema.parse("demo");

const FIELDS = {
  _id: "id",
  name: "name",
  email: "email",
  company: "company",
  city: "city",
  note: "text",
  at: "date",
  active: "boolean",
  qty: { number: [1, 5] },
  ratio: { number: [0.5, 1.5] },
  price: { money: [10, 20] },
  status: ["paid", "pending", "refunded"],
};

function specOf(fixtures: JsonObject, pageId = "home"): string {
  return JSON.stringify({
    version: 1,
    pages: [
      {
        id: pageId,
        title: "Home",
        fixtures,
        tree: [
          {
            type: "TableView",
            options: {
              caption: "People",
              fetchUrl: "fixture:people",
              columns: {
                name: { type: "string" },
                price: { type: "number" },
              },
            },
          },
        ],
      },
    ],
  });
}

const GENERATED = { people: { $generate: { rows: 30, fields: FIELDS } } };

function read(text: string) {
  const parsed = parseSpec(text);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  return parsed.spec;
}

function rowsOf(text: string, name = DEMO, now?: number) {
  const fixtures = compileSpec(name, read(text), now).fixtures.get("home");
  return z.array(z.record(z.unknown())).parse(fixtures?.people);
}

function issuesOf(fixture: Json) {
  const parsed = parseSpec(specOf({ people: fixture }));
  return parsed.ok ? [] : parsed.issues;
}

const rowsSchema = z.object({
  results: z.array(z.object({ _id: z.string() }).passthrough()),
  total: z.number(),
});

describe("[unit] mockup $generate fixtures: rows", () => {
  it("makes every kind of value, in the order the fields are written", () => {
    const rows = rowsOf(specOf(GENERATED));

    expect(rows).to.have.length(30);
    expect(Object.keys(rows[0])).to.deep.equal(Object.keys(FIELDS));
    expect(rows.map((row) => row._id)).to.deep.equal(
      rows.map((_, index) => `r${index + 1}`),
    );
    for (const row of rows) {
      const rowSchema = z
        .object({
          name: z.string().regex(/^\S+ \S+$/),
          email: z.string().regex(/^[a-z.-]+@example\.com$/),
          company: z.string().regex(/^\S+ \S+$/),
          city: z.string().min(1),
          note: z.string().regex(/^[A-Z].*\.$/),
          at: z.string().datetime(),
          active: z.boolean(),
          qty: z.number().int().min(1).max(5),
          ratio: z.number().min(0.5).max(1.5),
          price: z.number().min(10).max(20),
          status: z.enum(["paid", "pending", "refunded"]),
        })
        .passthrough();
      expect(rowSchema.parse(row)).to.be.an("object");
      expect(row.price).to.equal(Math.round(Number(row.price) * 100) / 100);
    }
    expect(new Set(rows.map((row) => row.status)).size).to.equal(3);
    expect(new Set(rows.map((row) => row.active)).size).to.equal(2);
    expect(new Set(rows.map((row) => row.name)).size).to.be.greaterThan(10);
  });

  it("gives a name and an email of the same row the same person", () => {
    for (const row of rowsOf(specOf(GENERATED))) {
      const [first, last] = z.string().parse(row.name).split(" ");
      expect(row.email).to.equal(
        `${first}.${last}@example.com`
          .normalize("NFD")
          .replaceAll(/[̀-ͯ]/g, "")
          .toLowerCase(),
      );
    }
  });

  it("yields the same rows on every read and another set for another seed", () => {
    const base = rowsOf(specOf(GENERATED));
    const again = rowsOf(specOf(GENERATED));
    const otherPage = compileSpec(
      DEMO,
      read(specOf(GENERATED, "other")),
    ).fixtures.get("other")?.people;
    const otherMockup = rowsOf(
      specOf(GENERATED),
      mockupNameSchema.parse("another"),
    );
    const otherKey = rowsOf(
      specOf({ people: { $generate: { rows: 30, fields: FIELDS } } }).replace(
        "fixture:people",
        "fixture:people",
      ),
    );

    expect(again).to.deep.equal(base);
    expect(otherKey).to.deep.equal(base);
    expect(otherPage).to.not.deep.equal(base);
    expect(otherMockup).to.not.deep.equal(base);
  });

  it("keeps a field's values when another field is added, and defaults to 8 rows", () => {
    const small = rowsOf(
      specOf({ people: { $generate: { fields: { name: "name" } } } }),
    );
    const grown = rowsOf(
      specOf({
        people: {
          $generate: { rows: 30, fields: { name: "name", city: "city" } },
        },
      }),
    );

    expect(small).to.have.length(8);
    expect(grown.slice(0, 8).map((row) => row.name)).to.deep.equal(
      small.map((row) => row.name),
    );
  });

  it("leaves a fixture that is not a $generate value as written", () => {
    const fixtures = compileSpec(
      DEMO,
      read(specOf({ people: [{ _id: "a" }], total: { value: 3 } })),
    ).fixtures.get("home");

    expect(fixtures).to.deep.equal({
      people: [{ _id: "a" }],
      total: { value: 3 },
    });
  });
});

const DAY = 86_400_000;
const NOON = Date.parse("2026-11-17T12:34:56Z");
const DATES = { people: { $generate: { rows: 60, fields: { at: "date" } } } };

function datesOf(now: number): number[] {
  return rowsOf(specOf(DATES), DEMO, now).map((row) =>
    Date.parse(z.string().parse(row.at)),
  );
}

describe("[unit] mockup $generate fixtures: dates", () => {
  it("spreads a date over the 30 days before the clock's day, so a week view has rows (fails dates fixed in 2026)", () => {
    for (const now of [NOON, Date.parse("2027-05-01T00:00:01Z")]) {
      const today = now - (now % DAY);
      const dates = datesOf(now);

      expect(dates.every((at) => at <= now && at > today - 30 * DAY)).to.equal(
        true,
      );
      expect(dates.filter((at) => at > now - 7 * DAY).length).to.be.greaterThan(
        0,
      );
      expect(Math.min(...dates)).to.be.lessThan(today - 20 * DAY);
    }
  });

  it("gives the same dates on every read of one day, and the same rows moved by the days that passed", () => {
    const morning = datesOf(Date.parse("2026-11-17T00:00:01Z"));
    const night = datesOf(Date.parse("2026-11-17T23:59:59Z"));
    const nextDay = datesOf(Date.parse("2026-11-18T08:00:00Z"));

    expect(night).to.deep.equal(morning);
    expect(nextDay).to.deep.equal(morning.map((at) => at + DAY));
  });

  it("leaves a date written in the spec as it was written", () => {
    const written = "2026-01-05T10:00:00.000Z";
    const fixtures = compileSpec(
      DEMO,
      read(specOf({ people: [{ _id: "a", at: written }] })),
      NOON,
    ).fixtures.get("home");

    expect(fixtures).to.deep.equal({ people: [{ _id: "a", at: written }] });
  });
});

describe("[unit] mockup $generate fixtures: validation", () => {
  it("accepts the largest and the smallest row count", () => {
    expect(
      issuesOf({ $generate: { rows: 200, fields: { a: "id" } } }),
    ).to.deep.equal([]);
    expect(
      issuesOf({ $generate: { rows: 1, fields: { a: "id" } } }),
    ).to.deep.equal([]);
  });

  it("points at the row count out of range or not whole", () => {
    for (const rows of [0, 201, 2.5, "8"]) {
      expect(
        issuesOf({ $generate: { rows, fields: { a: "id" } } }).map(
          (issue) => issue.path,
        ),
      ).to.deep.equal(["/pages/0/fixtures/people/$generate/rows"]);
    }
  });

  it("points at a field of an unknown kind, with the kinds it may take", () => {
    const issues = issuesOf({
      $generate: { fields: { good: "id", bad: "phone" } },
    });

    expect(issues).to.have.length(1);
    expect(issues[0].path).to.equal(
      "/pages/0/fixtures/people/$generate/fields/bad",
    );
    expect(issues[0].message).to.contain('"number": [min, max]');
  });

  it("points at a malformed range, a range the wrong way round and an empty list", () => {
    const issues = issuesOf({
      $generate: {
        fields: {
          one: { number: [1] },
          back: { money: [5, 1] },
          none: [],
          mixed: { number: [1, 2], money: [1, 2] },
          words: [1, 2],
        },
      },
    });

    expect(issues.map((issue) => issue.path)).to.have.members([
      "/pages/0/fixtures/people/$generate/fields/one",
      "/pages/0/fixtures/people/$generate/fields/back",
      "/pages/0/fixtures/people/$generate/fields/none",
      "/pages/0/fixtures/people/$generate/fields/mixed",
      "/pages/0/fixtures/people/$generate/fields/words",
    ]);
    expect(
      issues.find((issue) => issue.path.endsWith("/back"))?.message,
    ).to.contain("minimum must not exceed");
  });

  it("refuses no fields, a key beside $generate and an unknown $generate key", () => {
    expect(
      issuesOf({ $generate: { fields: {} } }).map((issue) => issue.path),
    ).to.deep.equal(["/pages/0/fixtures/people/$generate/fields"]);
    expect(
      issuesOf({ $generate: { rows: 3 } }).map((issue) => issue.path),
    ).to.deep.equal(["/pages/0/fixtures/people/$generate/fields"]);
    expect(
      issuesOf({ $generate: { fields: { a: "id" } }, extra: 1 }).map(
        (issue) => issue.path,
      ),
    ).to.deep.equal(["/pages/0/fixtures/people"]);
    expect(
      issuesOf({ $generate: { fields: { a: "id" }, seed: 1 } }).map(
        (issue) => issue.path,
      ),
    ).to.deep.equal(["/pages/0/fixtures/people/$generate"]);
  });

  it("escapes a field key in the pointer", () => {
    expect(
      issuesOf({ $generate: { fields: { "a/b": "nope" } } }).map(
        (issue) => issue.path,
      ),
    ).to.deep.equal(["/pages/0/fixtures/people/$generate/fields/a~1b"]);
  });
});

describe("[unit] mockup $generate fixtures: where a fixture is read", () => {
  const served = serveMockupRoutes(
    JSON.stringify({
      version: 1,
      pages: [
        {
          id: "home",
          title: "Home",
          liveRoutes: { people: "/api/people" },
          fixtures: {
            people: {
              $generate: {
                rows: 12,
                fields: {
                  _id: "id",
                  name: "name",
                  status: ["a", "b"],
                  qty: { number: [1, 9] },
                },
              },
            },
          },
          tree: [
            {
              type: "TableView",
              options: {
                caption: "People",
                fetchUrl: "fixture:people",
                columns: {
                  name: { type: "string" },
                  status: { type: "string" },
                  qty: { type: "number" },
                },
                tabs: [
                  {
                    id: "a",
                    label: "A",
                    filter: { accessorKey: "status", mode: "is", value: "a" },
                  },
                ],
              },
            },
          ],
        },
      ],
    }),
  );
  let owner: AxiosInstance;

  before(() => {
    ({ owner } = served());
  });

  it("serves the generated rows from the fixture route", async () => {
    const response = await owner.get(`${BASE}/desk/pages/home/fixtures/people`);

    expect(
      z.array(z.object({ name: z.string() })).parse(response.data),
    ).to.have.length(12);
  });

  it("lists, sorts, filters and pages them on the rows route", async () => {
    const all = rowsSchema.parse(
      (await owner.get(`${BASE}/desk/pages/home/fixtures/people/rows?limit=5`))
        .data,
    );
    const tab = rowsSchema.parse(
      (
        await owner.get(
          `${BASE}/desk/pages/home/fixtures/people/rows?filter_status=is:a`,
        )
      ).data,
    );
    const sorted = rowsSchema.parse(
      (
        await owner.get(
          `${BASE}/desk/pages/home/fixtures/people/rows?sortKey=qty&sortDirection=desc`,
        )
      ).data,
    );

    expect(all.total).to.equal(12);
    expect(all.results).to.have.length(5);
    expect(tab.total).to.be.greaterThan(0).and.lessThan(12);
    expect(tab.results.every((row) => row.status === "a")).to.equal(true);
    const quantities = sorted.results.map((row) => Number(row.qty));
    expect(quantities).to.deep.equal([...quantities].sort((a, b) => b - a));
  });

  it("builds a table over them with no issue and a live route beside them", async () => {
    const state = await served().engine.store.state(
      mockupNameSchema.parse("desk"),
    );

    expect(state?.issues).to.deep.equal([]);
    expect(state?.pages[0].realTree).to.have.length(1);
  });

  it("answers the fixture route of a missing key with a 404", async () => {
    const response = await owner.get(
      `${BASE}/desk/pages/home/fixtures/missing`,
    );

    expect(response.status).to.equal(404);
  });
});

describe("[unit] mockup $generate fixtures: JSON Schema", () => {
  const validate = new Ajv2020({ validateFormats: false }).compile(
    MOCKUP_SPEC_SCHEMA,
  );

  function check(fixtures: JsonObject): boolean {
    return validate({
      version: 1,
      pages: [{ id: "home", title: "Home", fixtures, tree: [] }],
    });
  }

  it("accepts a $generate fixture of every kind and any other JSON value", () => {
    expect(
      check({
        people: { $generate: { rows: 9, fields: FIELDS } },
        kpi: { value: 3 },
        list: [1],
      }),
    ).to.equal(true);
  });

  it("refuses a bad kind, a bad row count and an empty field list", () => {
    expect(check({ p: { $generate: { fields: { a: "phone" } } } })).to.equal(
      false,
    );
    expect(
      check({ p: { $generate: { rows: 201, fields: { a: "id" } } } }),
    ).to.equal(false);
    expect(check({ p: { $generate: { fields: {} } } })).to.equal(false);
    expect(
      check({ p: { $generate: { fields: { a: { money: [1] } } } } }),
    ).to.equal(false);
  });
});
