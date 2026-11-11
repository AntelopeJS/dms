import { expect } from "chai";
import type {
  QueryPoint,
  ResourceFieldStructure,
} from "@antelopejs/interface-dms-builder";
import type { QueryPlan } from "../../../implementations/dms-builder/engine/query-plan";
import {
  executePlan,
  type PlanPoints,
  type PlanStream,
  type PlanValue,
} from "../../../implementations/dms-builder/engine/query-plan-execute";

const FIELDS: ResourceFieldStructure[] = [
  { name: "createdAt", dataType: { $dataType: "date" } },
];
const PLAN: QueryPlan = {
  filters: [],
  measure: { kind: "count" },
  group: { field: "createdAt", bucket: "week" },
};
const MS_PER_DAY = 86_400_000;

/** The number each stand-in value of this file stands for. */
const numbers = new Map<unknown, number>();
/** The number of the value built last: the last step of a bucket's arithmetic is the bucket. */
let latest = Number.NaN;

/** A number answering the calls of a database value, so the arithmetic of a bucket can be computed. */
function figure(
  n: number,
  parts?: Record<"year" | "dayofyear" | "dayofweek", number>,
): PlanValue {
  const self: PlanValue = {
    eq: () => self,
    ne: () => self,
    gt: () => self,
    ge: () => self,
    lt: () => self,
    le: () => self,
    year: () => figure(parts?.year ?? n),
    month: () => self,
    day: () => self,
    dayofyear: () => figure(parts?.dayofyear ?? n),
    dayofweek: () => figure(parts?.dayofweek ?? n),
    mul: (other) => figure(n * (numbers.get(other) ?? Number(other))),
    div: (other) => figure(n / (numbers.get(other) ?? Number(other))),
    add: (other) => figure(n + (numbers.get(other) ?? Number(other))),
    sub: (other) => figure(n - (numbers.get(other) ?? Number(other))),
    floor: () => figure(Math.floor(n)),
  };
  numbers.set(self, n);
  latest = n;
  return self;
}

/** A date as the database reports its year, its day of the year and its ISO weekday. */
function dateValue(day: string): PlanValue {
  const at = new Date(`${day}T00:00:00Z`);
  const year = at.getUTCFullYear();
  return figure(0, {
    year,
    dayofyear: (at.getTime() - Date.UTC(year, 0, 1)) / MS_PER_DAY + 1,
    dayofweek: ((at.getUTCDay() + 6) % 7) + 1,
  });
}

function stampOf(day: string): number {
  let stamp = Number.NaN;
  const grouped: PlanPoints = Object.assign(Promise.resolve<QueryPoint[]>([]), {
    orderBy: () => grouped,
    slice: () => grouped,
  });
  const stream: PlanStream = {
    filter: () => stream,
    map: (mapper) => {
      mapper({ key: () => dateValue(day) });
      stamp = latest;
      return stream;
    },
    group: () => grouped,
    count: () => Promise.resolve(0),
    sum: () => Promise.resolve(0),
    avg: () => Promise.resolve(0),
    min: () => Promise.resolve(0),
    max: () => Promise.resolve(0),
  };
  executePlan(stream, PLAN, FIELDS);
  return stamp;
}

const MONDAYS = [
  ["2026-08-03", "2026-08-03"],
  ["2026-08-09", "2026-08-03"],
  ["2026-12-31", "2026-12-28"],
  ["2027-01-01", "2026-12-28"],
  ["2027-01-03", "2026-12-28"],
  ["2027-01-04", "2027-01-04"],
  ["2024-03-01", "2024-02-26"],
  ["2020-12-31", "2020-12-28"],
  ["2021-01-03", "2020-12-28"],
  ["2000-01-01", "1999-12-27"],
] as const;

describe("the week bucket arithmetic", () => {
  for (const [day, monday] of MONDAYS) {
    it(`stamps ${day} with the days since 1970-01-01 of its Monday ${monday}`, () => {
      expect(stampOf(day)).to.equal(
        Date.parse(`${monday}T00:00:00Z`) / MS_PER_DAY,
      );
    });
  }
});
