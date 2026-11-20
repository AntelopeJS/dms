import { expect } from "chai";
import { Project, type MethodDeclaration } from "ts-morph";
import type {
  QueryParamValue,
  ResourceFieldStructure,
} from "@antelopejs/interface-dms-builder";
import {
  type CompiledQuery,
  emitPlan,
  parseQueryRouteCall,
  queryRouteMethodText,
  registerBuiltinQueryTemplates,
  type CompiledChain,
  getQueryTemplate,
  parseModelMethod,
  type QueryParams,
} from "../../../implementations/dms-builder/engine";

function field(name: string, dataType: string): ResourceFieldStructure {
  return { name, dataType: { $dataType: dataType } };
}

const FIELDS = [
  field("status", "string"),
  field("amount", "number"),
  field("createdAt", "date"),
];

const RENTED = { field: "status", op: "eq", value: "rented" };
const PERIOD = [
  { field: "createdAt", op: "ge", value: { $param: { name: "from" } } },
  { field: "createdAt", op: "le", value: { $param: { name: "to" } } },
];

const RATIO_PARAMS: QueryParams = {
  numerator: { where: [RENTED, ...PERIOD] },
  denominator: { where: PERIOD },
};

/** One query of each template, which a body is read back as. */
interface TemplateCase {
  id: string;
  params: QueryParams;
}

const RATIO_OVER_SUM: QueryParams = {
  numerator: { op: "sum", field: "amount", where: [RENTED] },
  denominator: { where: [RENTED] },
};

const TEMPLATE_CASES: TemplateCase[] = [
  { id: "count", params: { where: [RENTED] } },
  { id: "aggregate", params: { op: "sum", field: "amount", where: [RENTED] } },
  { id: "series", params: { groupBy: "status", op: "sum", field: "amount" } },
  { id: "ratio", params: RATIO_OVER_SUM },
];

function chainOf(template: string, params: QueryParams): CompiledChain {
  const found = getQueryTemplate(template);
  if (!found) {
    throw new Error(`no template named ${template}`);
  }
  return emitPlan(found.plan(params, FIELDS), FIELDS);
}

/** The model method the builder would write for a chain, parsed as a project would read it. */
function modelMethod(chain: CompiledChain): MethodDeclaration {
  const parameters = chain.parameters
    .map((parameter) => `${parameter.name}: ${parameter.type}`)
    .join(", ");
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    "database.ts",
    `class BikeModel {\n  utilisation(${parameters}) ${chain.body}\n}`,
  );
  return file.getClassOrThrow("BikeModel").getMethodOrThrow("utilisation");
}

function specOf(
  template: string,
  params: QueryParams,
  extra: Partial<CompiledQuery> = {},
): CompiledQuery {
  return {
    name: "utilisation",
    endpoint: "/stats/utilisation",
    template,
    params,
    chain: chainOf(template, params),
    naming: { measure: "count", label: "bike" },
    ...extra,
  };
}

function routeText(spec: CompiledQuery): string {
  return queryRouteMethodText(spec, "BikeModel", "main", "utilisation", "Page")
    .text;
}

function routeMethod(spec: CompiledQuery): MethodDeclaration {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    "page.ts",
    `class Page {\n${routeText(spec)}\n}`,
  );
  return file.getClassOrThrow("Page").getMethodOrThrow("utilisation");
}

/** Whether a value is the `$bind` sentinel a parsed filter carries. */
function bound(name: string): QueryParamValue {
  return { $bind: name };
}

describe("the model method of a ratio", () => {
  before(() => registerBuiltinQueryTemplates());

  it("is one return of percentOf over a chain per side, importing the helper", () => {
    const chain = chainOf("ratio", {
      numerator: { where: [RENTED] },
      denominator: {},
    });

    expect(chain.body).to.equal(
      [
        "{",
        "  return percentOf(",
        '    this.table.filter((row) => row.key("status").eq("rented")).count(),',
        "    this.table.count(),",
        "  );",
        "}",
      ].join("\n"),
    );
    expect(chain.imports).to.deep.equal([
      {
        name: "percentOf",
        module: "@antelopejs/interface-dms/base/query-response",
      },
    ]);
  });

  it("breaks a side onto its hops when it does not fit beside its comma", () => {
    const chain = chainOf("ratio", {
      numerator: {
        where: [RENTED, { field: "amount", op: "gt", value: 10 }],
      },
      denominator: {},
    });

    expect(chain.body).to.equal(
      [
        "{",
        "  return percentOf(",
        "    this.table",
        '      .filter((row) => row.key("status").eq("rented"))',
        '      .filter((row) => row.key("amount").gt(10))',
        "      .count(),",
        "    this.table.count(),",
        "  );",
        "}",
      ].join("\n"),
    );
  });

  it("keeps a short pair of sides on one line", () => {
    const chain = chainOf("ratio", { numerator: {}, denominator: {} });

    expect(chain.body).to.equal(
      "{\n  return percentOf(this.table.count(), this.table.count());\n}",
    );
  });

  it("shares one model parameter per period bound across both sides", () => {
    const chain = chainOf("ratio", RATIO_PARAMS);

    expect(
      chain.parameters.map(({ name, routeName, type }) => ({
        name,
        routeName,
        type,
      })),
      "four filters bind from and to, so a method taking four dates would break the comparison",
    ).to.deep.equal([
      { name: "minCreatedAt", routeName: "from", type: "Date" },
      { name: "maxCreatedAt", routeName: "to", type: "Date" },
    ]);
    expect(chain.body.match(/minCreatedAt/g)).to.have.length(2);
    expect(chain.body.match(/maxCreatedAt/g)).to.have.length(2);
  });

  it("reads back as the parameters that wrote it, the period bound on both sides", () => {
    const read = parseModelMethod(modelMethod(chainOf("ratio", RATIO_PARAMS)));

    expect(read?.template).to.equal("ratio");
    expect(read?.params).to.deep.equal({
      numerator: {
        where: [
          { field: "status", op: "eq", value: "rented" },
          { field: "createdAt", op: "ge", value: bound("minCreatedAt") },
          { field: "createdAt", op: "le", value: bound("maxCreatedAt") },
        ],
      },
      denominator: {
        where: [
          { field: "createdAt", op: "ge", value: bound("minCreatedAt") },
          { field: "createdAt", op: "le", value: bound("maxCreatedAt") },
        ],
      },
    });
  });

  it("reads back a sum side with its field, and a count side as the empty object", () => {
    const read = parseModelMethod(
      modelMethod(chainOf("ratio", RATIO_OVER_SUM)),
    );

    expect(read?.params).to.deep.equal({
      numerator: {
        op: "sum",
        field: "amount",
        where: [{ field: "status", op: "eq", value: "rented" }],
      },
      denominator: { where: [{ field: "status", op: "eq", value: "rented" }] },
    });
  });

  it("reads back a body its formatter wrapped differently", () => {
    const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(
      "database.ts",
      `class BikeModel {
  utilisation() {
    return percentOf(
      this.table
        .filter((row) => row.key("status").eq("rented"))
        .count(),
      this.table.count(),
    );
  }
}`,
    );
    const method = file
      .getClassOrThrow("BikeModel")
      .getMethodOrThrow("utilisation");

    expect(parseModelMethod(method)?.template).to.equal("ratio");
  });
});

/**
 * A method is read as the one template that parses it, and as no query when two
 * would: a ratio body that a count, an aggregate or a series also accepted would
 * be read as nothing, and the page that serves it as opaque.
 */
describe("which template reads a model method", () => {
  before(() => registerBuiltinQueryTemplates());

  for (const { id, params } of TEMPLATE_CASES) {
    it(`reads the ${id} body as ${id} alone`, () => {
      const method = modelMethod(chainOf(id, params));

      expect(parseModelMethod(method)?.template).to.equal(id);
      for (const other of TEMPLATE_CASES) {
        expect(
          getQueryTemplate(other.id)?.parse(method) !== undefined,
          `${other.id} parsing a ${id} body`,
        ).to.equal(other.id === id);
      }
    });
  }

  it("declines a ratio whose side is not a chain the builder wrote", () => {
    const file = new Project({ useInMemoryFileSystem: true }).createSourceFile(
      "database.ts",
      `class BikeModel {
  utilisation() {
    return percentOf(this.table.count(), this.table.avg("amount"));
  }
}`,
    );
    const method = file
      .getClassOrThrow("BikeModel")
      .getMethodOrThrow("utilisation");

    expect(getQueryTemplate("ratio")?.parse(method)).to.equal(undefined);
  });
});

describe("the route of a scalar query", () => {
  before(() => registerBuiltinQueryTemplates());

  it("answers a bare value for a count, exactly as before", () => {
    const text = routeText(specOf("count", { where: [RENTED] }));

    expect(text).to.contain("): Promise<{ value: number }> {");
    expect(text).to.contain(
      "return { value: await model.utilisation().run() };",
    );
    expect(text).to.not.contain("kpiValueData");
  });

  it("keeps a bare value when it compares but binds no period", () => {
    const text = routeText(
      specOf("count", { where: [RENTED] }, { compare: true }),
    );

    expect(text).to.contain(
      "return { value: await model.utilisation().run() };",
    );
    expect(text).to.not.contain("compareFrom");
  });

  it("answers a KPI's figure and its change when a count compares over a bound period", () => {
    const text = routeText(
      specOf("count", { where: PERIOD }, { compare: true }),
    );

    expect(text).to.contain("): Promise<KpiCardData> {");
    expect(text).to.contain(
      'return kpiValueData(await model.utilisation(from === undefined ? new Date("0001-01-01T00:00:00.000Z") : new Date(String(from)), to === undefined ? new Date("9999-12-31T23:59:59.999Z") : new Date(String(to))).run(), { previous: compareFrom && compareTo ? await model.utilisation(new Date(String(compareFrom)), new Date(String(compareTo))).run() : undefined });',
    );
    expect(text).to.contain(
      '@Parameter("compareFrom", "query") compareFrom: string | true | undefined,',
    );
  });

  it("imports the helper and its type from the base barrel", () => {
    const route = queryRouteMethodText(
      specOf("count", { where: PERIOD }, { compare: true }),
      "BikeModel",
      "main",
      "utilisation",
      "Page",
    );

    expect(route.symbols).to.deep.include.members([
      { name: "kpiValueData", module: "@antelopejs/interface-dms/base" },
      { name: "KpiCardData", module: "@antelopejs/interface-dms/base" },
    ]);
  });

  it("answers a ratio through kpiValueData even when it compares nothing, so a null leaves value out", () => {
    const ratio = routeText(specOf("ratio", RATIO_PARAMS));

    expect(ratio).to.contain("): Promise<KpiCardData> {");
    expect(ratio).to.contain(
      'return kpiValueData(await model.utilisation(from === undefined ? new Date("0001-01-01T00:00:00.000Z") : new Date(String(from)), to === undefined ? new Date("9999-12-31T23:59:59.999Z") : new Date(String(to))).run());',
    );
    expect(ratio).to.not.contain("{ value:");
    expect(ratio).to.not.contain("compareFrom");
  });

  it("imports kpiValueData and its type for a ratio that compares nothing", () => {
    const route = queryRouteMethodText(
      specOf("ratio", RATIO_PARAMS),
      "BikeModel",
      "main",
      "utilisation",
      "Page",
    );

    expect(route.symbols).to.deep.include.members([
      { name: "kpiValueData", module: "@antelopejs/interface-dms/base" },
      { name: "KpiCardData", module: "@antelopejs/interface-dms/base" },
    ]);
  });

  it("keeps a count, which never answers null, a bare number", () => {
    const count = routeText(specOf("count", { where: PERIOD }));

    expect(count).to.contain("): Promise<{ value: number }> {");
    expect(count).to.not.contain("kpiValueData");
  });

  it("answers a ratio's figure and its change when it compares, whatever response was asked for", () => {
    const text = routeText(
      specOf("ratio", RATIO_PARAMS, { compare: true, response: "items" }),
    );

    expect(text).to.contain("): Promise<KpiCardData> {");
    expect(text).to.contain("return kpiValueData(await model.utilisation(");
    expect(text).to.not.contain("topListData");
  });
});

describe("reading the route of a scalar query back", () => {
  before(() => registerBuiltinQueryTemplates());

  it("reads a compared scalar as a scalar arranged as a value, comparing", () => {
    const call = parseQueryRouteCall(
      routeMethod(specOf("ratio", RATIO_PARAMS, { compare: true })),
    );

    expect(call).to.deep.include({
      modelMethod: "utilisation",
      output: "scalar",
      response: "value",
      compare: true,
    });
    expect(call?.args).to.have.length(2);
  });

  it("reads a plain scalar as a scalar with no arrangement and no comparison", () => {
    const call = parseQueryRouteCall(
      routeMethod(specOf("count", { where: PERIOD })),
    );

    expect(call?.output).to.equal("scalar");
    expect(call?.response).to.equal(undefined);
    expect(call?.compare).to.equal(undefined);
  });

  it("reads a ratio that compares nothing as a scalar arranged as a value, with no comparison", () => {
    const call = parseQueryRouteCall(
      routeMethod(specOf("ratio", RATIO_PARAMS)),
    );

    expect(call?.output).to.equal("scalar");
    expect(call?.response).to.equal("value");
    expect(call?.compare).to.equal(undefined);
  });

  it("still reads a KPI card over points as a series arranged as a value", () => {
    const call = parseQueryRouteCall(
      routeMethod(
        specOf(
          "series",
          { groupBy: "createdAt", bucket: "month", where: PERIOD },
          { response: "value", compare: true },
        ),
      ),
    );

    expect(call).to.deep.include({
      output: "series",
      response: "value",
      compare: true,
    });
  });
});
