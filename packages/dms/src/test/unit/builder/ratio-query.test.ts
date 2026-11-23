import fs from "node:fs";
import path from "node:path";
import { expect } from "chai";
import {
  AddQuery,
  ConfigureQuery,
  CreateCategory,
  CreatePage,
  CreateResource,
  GetPageStructure,
  RemoveQuery,
} from "../../../implementations/dms-builder";
import type {
  AddQueryInput,
  OpResult,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import {
  createFixture,
  destroyFixture,
  expectOk,
  type Fixture,
} from "./harness";

const PAGE = "/shop/fleet";
const PAGE_FILE = "fleet/page.ts";
const MODEL_FILE = "bike/database.ts";
const OP_TIMEOUT = 60_000;

let app: Fixture;

const RENTED = { field: "status", op: "eq", value: "rented" };
const PERIOD = [
  { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
  { field: "createdAt", op: "le", value: { $param: { name: "to" } } },
];
const IN_PERIOD = {
  numerator: { where: [RENTED, ...PERIOD] },
  denominator: { where: PERIOD },
};

/** Bikes rented over bikes in the period the page selects, against the period before. */
const UTILISATION: AddQueryInput = {
  name: "utilisation",
  resource: "bike",
  template: "ratio",
  params: IN_PERIOD,
  response: "value",
  compare: true,
};

/**
 * The issues of an `invalid_config` refusal. Any other outcome throws, so the
 * assertions over the issues are never skipped by a refusal of another shape.
 */
function refusedIssues(result: OpResult<unknown>): ValidationIssue[] {
  if (result.ok || result.error.code !== "invalid_config") {
    throw new Error(
      `expected an invalid_config refusal, got ${JSON.stringify(result)}`,
    );
  }
  return result.error.issues;
}

async function queryNamed(name: string) {
  const structure = expectOk(await GetPageStructure(PAGE), "GetPageStructure");
  return structure.queries.find((query) => query.name === name);
}

function writesARatio(): void {
  it("writes the two sides into one model method taking the period once", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await AddQuery(PAGE, UTILISATION), "AddQuery");

    const model = app.read(MODEL_FILE);
    expect(model).to.contain(
      "utilisation(minCreatedAt: Date, maxCreatedAt: Date) {\n    return percentOf(",
    );
    expect(model, "the helper is imported where the model uses it").to.contain(
      'import { percentOf } from "@antelopejs/interface-dms/base/query-response";',
    );
  });

  it("serves a KPI's figure with the period before it", async () => {
    const page = app.read(PAGE_FILE);

    expect(page).to.contain("): Promise<KpiCardData> {");
    expect(page).to.contain(
      'return kpiValueData(await model.utilisation(from === undefined ? new Date("0001-01-01T00:00:00.000Z") : new Date(String(from)), to === undefined ? new Date("9999-12-31T23:59:59.999Z") : new Date(String(to))).run(), { previous: compareFrom && compareTo ? await model.utilisation(new Date(String(compareFrom)), new Date(String(compareTo))).run() : undefined });',
    );
    expect(page).to.contain(
      'import { KpiCardData, kpiValueData } from "@antelopejs/interface-dms/base";',
    );
  });
}

function readsAndEditsARatio(): void {
  it("reads back as a ratio over the route's own parameters, comparing", async () => {
    const utilisation = await queryNamed("utilisation");

    expect(utilisation?.opaque).to.not.equal(true);
    expect(utilisation?.template).to.equal("ratio");
    expect(utilisation?.output).to.equal("scalar");
    expect(utilisation?.response).to.equal("value");
    expect(utilisation?.compare).to.equal(true);
    expect(utilisation?.params).to.deep.equal({
      numerator: {
        where: [
          RENTED,
          {
            field: "createdAt",
            op: "ge",
            value: { $param: { name: "from", in: "query" } },
          },
          {
            field: "createdAt",
            op: "le",
            value: { $param: { name: "to", in: "query" } },
          },
        ],
      },
      denominator: {
        where: [
          {
            field: "createdAt",
            op: "ge",
            value: { $param: { name: "from", in: "query" } },
          },
          {
            field: "createdAt",
            op: "le",
            value: { $param: { name: "to", in: "query" } },
          },
        ],
      },
    });
  });

  it("keeps the ratio and its comparison when only a side changes", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigureQuery(`${PAGE}@utilisation`, {
        params: {
          ...IN_PERIOD,
          numerator: {
            where: [{ field: "status", op: "ne", value: "free" }, ...PERIOD],
          },
        },
      }),
      "ConfigureQuery",
    );

    expect(app.read(MODEL_FILE)).to.contain('row.key("status").ne("free")');
    const utilisation = await queryNamed("utilisation");
    expect(utilisation?.template).to.equal("ratio");
    expect(utilisation?.compare).to.equal(true);
  });

  it("answers a ratio that compares nothing through kpiValueData, which leaves a null value out", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        name: "overallRate",
        resource: "bike",
        template: "ratio",
        params: { numerator: { where: [RENTED] }, denominator: {} },
      }),
      "AddQuery",
    );

    expect(app.read(PAGE_FILE)).to.contain(
      "return kpiValueData(await model.overallRate().run());",
    );
    expect(app.read(PAGE_FILE)).to.not.contain(
      "{ value: await model.overallRate()",
    );
    const read = await queryNamed("overallRate");
    expect(read?.opaque).to.not.equal(true);
    expect(read?.template).to.equal("ratio");
    expect(read?.output).to.equal("scalar");
    expect(read?.response).to.equal("value");
    expect(read?.compare).to.equal(undefined);
  });

  it("compares a count over a bound period as it compares a ratio", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, {
        name: "bikesInPeriod",
        resource: "bike",
        template: "count",
        params: { where: PERIOD },
        compare: true,
      }),
      "AddQuery",
    );

    expect(app.read(PAGE_FILE)).to.contain(
      "return kpiValueData(await model.bikesInPeriod(",
    );
    const read = await queryNamed("bikesInPeriod");
    expect(read?.template).to.equal("count");
    expect(read?.output).to.equal("scalar");
    expect(read?.response).to.equal("value");
    expect(read?.compare).to.equal(true);
  });

  it("answers a bare value again when the comparison is dropped", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await ConfigureQuery(`${PAGE}@bikesInPeriod`, { compare: false }),
      "ConfigureQuery",
    );

    expect(app.read(PAGE_FILE)).to.contain(
      "return { value: await model.bikesInPeriod(",
    );
    expect((await queryNamed("bikesInPeriod"))?.compare).to.equal(undefined);
  });
}

/**
 * The fixture compiles with `noUnusedLocals`, so an import its last user left
 * behind fails the next write rather than lingering unnoticed.
 */
function leavesNoImportBehind(): void {
  it("drops the helper's import once the last ratio becomes a count", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(await RemoveQuery(`${PAGE}@overallRate`), "RemoveQuery");
    expect(app.read(MODEL_FILE), "another ratio still calls it").to.contain(
      "percentOf",
    );

    expectOk(
      await ConfigureQuery(`${PAGE}@utilisation`, {
        template: "count",
        params: { where: PERIOD },
      }),
      "ConfigureQuery",
    );

    expect(app.read(MODEL_FILE)).to.not.contain("percentOf");
  });

  it("imports it again for the next ratio and drops it with the last one removed", async function () {
    this.timeout(OP_TIMEOUT);
    expectOk(
      await AddQuery(PAGE, { ...UTILISATION, name: "freshRate" }),
      "AddQuery after",
    );
    expect(app.read(MODEL_FILE)).to.contain(
      'import { percentOf } from "@antelopejs/interface-dms/base/query-response";',
    );

    expectOk(await RemoveQuery(`${PAGE}@freshRate`), "RemoveQuery");
    expect(app.read(MODEL_FILE)).to.not.contain("percentOf");
  });
}

/**
 * An interface that predates the helpers would take the page the builder writes
 * to a type error, so it is refused first and the project told what to update.
 */
function refusesWhatTheInstalledInterfaceCannotServe(): void {
  const declaration = () =>
    path.join(
      app.root,
      "node_modules/@antelopejs/interface-dms/dist/base/query-response.d.ts",
    );

  before(() => {
    fs.mkdirSync(path.dirname(declaration()), { recursive: true });
    fs.writeFileSync(
      declaration(),
      "export declare function kpiCardData(): void;\n",
    );
  });

  after(() => {
    fs.rmSync(path.join(app.root, "node_modules"), {
      recursive: true,
      force: true,
    });
  });

  it("refuses a ratio when the interface has neither percentOf nor kpiValueData", async function () {
    this.timeout(OP_TIMEOUT);
    const issues = refusedIssues(
      await AddQuery(PAGE, { ...UTILISATION, name: "old", compare: false }),
    );

    expect(issues.map((found) => found.pointer)).to.deep.equal([
      "/template",
      "/template",
    ]);
    expect(issues[0].message).to.contain("percentOf");
    expect(issues[1].message).to.contain("kpiValueData");
    for (const found of issues) {
      expect(found.message).to.contain("update @antelopejs/interface-dms");
    }
    expect(app.read(PAGE_FILE)).to.not.contain("old(");
  });

  it("names both helpers for a ratio that also compares", async function () {
    this.timeout(OP_TIMEOUT);
    const issues = refusedIssues(
      await AddQuery(PAGE, { ...UTILISATION, name: "older" }),
    );

    expect(issues.map((found) => found.pointer)).to.deep.equal([
      "/template",
      "/compare",
    ]);
    expect(issues[0].message).to.contain("percentOf");
    expect(issues[1].message).to.contain("kpiValueData");
  });

  it("refuses a scalar that compares when the interface has no kpiValueData", async function () {
    this.timeout(OP_TIMEOUT);
    const issues = refusedIssues(
      await AddQuery(PAGE, {
        name: "oldCount",
        resource: "bike",
        template: "count",
        params: { where: PERIOD },
        compare: true,
      }),
    );

    expect(issues.map((found) => found.pointer)).to.deep.equal(["/compare"]);
    expect(issues[0].message).to.contain("kpiValueData");
  });
}

describe('a ratio query written through the builder: the template behind a card with `valueFormat: "percent"` is written, read back and reconfigured like every other, and a count that compares answers what a card reads', () => {
  before(async function () {
    this.timeout(120_000);
    app = createFixture({ compilerOptions: { noUnusedLocals: true } });
    expectOk(
      await CreateCategory({ name: "shop", displayName: "Shop" }),
      "CreateCategory",
    );
    expectOk(
      await CreateResource({
        name: "bike",
        displayName: "Bike",
        fields: [
          {
            name: "status",
            label: "Status",
            dataType: { $dataType: "string" },
          },
          {
            name: "createdAt",
            label: "Created",
            dataType: { $dataType: "date" },
          },
        ],
      }),
      "CreateResource",
    );
    expectOk(
      await CreatePage({
        name: "fleet",
        displayName: "Fleet",
        category: "pages.shop",
      }),
      "CreatePage",
    );
  });

  after(() => destroyFixture());

  writesARatio();
  readsAndEditsARatio();
  leavesNoImportBehind();

  describe("on an interface that predates the helpers", () => {
    refusesWhatTheInstalledInterfaceCannotServe();
  });
});
