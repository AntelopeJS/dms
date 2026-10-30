const path = require("node:path");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");

const root = process.argv[2];
const packageDir = path.join(root, "packages/interface-dms");
const load = createRequire(path.join(packageDir, "package.json"));
const dist = (file) => load(path.join(packageDir, "dist", file));
const { z } = load("zod");

const describeModule = dist("base/block-registry/internal/describe.js");

function recordDefReads(schema, log, label) {
  const def = schema._def;
  const proxy = new Proxy(def, {
    get(target, key, receiver) {
      log.push(`${label}.${String(key)}`);
      return Reflect.get(target, key, receiver);
    },
  });
  return Object.create(schema, { _def: { value: proxy } });
}

function observeDefReads(describeSchema) {
  const observed = {};
  for (const [name, schema] of Object.entries({
    optionalString: z.string().optional(),
    defaultString: z.string().default("x"),
    lazyString: z.lazy(() => z.string()),
    tuple: z.tuple([z.string()]),
    object: z.object({ a: z.string() }),
    record: z.record(z.string(), z.number()),
    enumeration: z.enum(["a"]),
  })) {
    const reads = [];
    try {
      describeSchema(recordDefReads(schema, reads, name));
    } catch (error) {
      reads.push(`threw ${error.message}`);
    }
    observed[`reads:${name}`] = reads;
  }
  return observed;
}

function describeBattery(describeSchema, describeOptions) {
  const counts = { lazy: 0, factory: 0, receivers: [] };
  const nativeEnum = { A: "x", B: 2 };
  const lazy = z.lazy(() => {
    counts.lazy += 1;
    return z.string();
  });
  const withFactory = z.string().default("seed");
  const factory = withFactory._def.defaultValue;
  withFactory._def.defaultValue = function () {
    counts.factory += 1;
    counts.receivers.push(this === withFactory._def);
    return factory();
  };
  const deep = (() => {
    let schema = z.object({ leaf: z.string() });
    for (let i = 0; i < 9; i += 1) schema = z.object({ next: schema });
    return schema;
  })();
  const schemas = {
    string: z.string(),
    optionalNullable: z.number().optional().nullable(),
    literal: z.literal("a"),
    literalNumber: z.literal(3),
    literalNaN: z.literal(Number.NaN),
    literalNull: z.literal(null),
    union: z.union([z.literal("a"), z.literal("b")]),
    mixedUnion: z.union([z.string(), z.number()]),
    discriminated: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("a") }),
      z.object({ kind: z.literal("b"), extra: z.string() }),
    ]),
    object: z.object({
      a: z.string().default("hi"),
      b: z.array(z.number()),
      c: z.tuple([z.string(), z.number()]),
      d: z.record(z.string(), z.boolean()),
      e: z.enum(["p", "q"]),
      f: z.nativeEnum(nativeEnum),
    }),
    intersection: z.intersection(
      z.object({ a: z.string() }),
      z.object({ b: z.number() }),
    ),
    lazy,
    lazyInObject: z.object({ inner: lazy }),
    effects: z.string().transform((value) => value),
    pipeline: z.string().pipe(z.string()),
    branded: z.string().brand("probe"),
    readonly: z.string().readonly(),
    caught: z.string().catch("fallback"),
    promise: z.promise(z.string()),
    withFactory,
    defaultObject: z.object({ x: z.number() }).default({ x: 1 }),
    defaultDate: z.date().default(new Date(0)),
    deepWrappers: z.string().optional().optional().optional().optional().optional().optional().optional().optional().optional(),
    deepObjects: deep,
    described: z.string().describe("text").optional(),
    primitives: z.object({
      big: z.bigint(),
      date: z.date(),
      any: z.any(),
      nan: z.nan(),
      map: z.map(z.string(), z.string()),
      set: z.set(z.string()),
      fn: z.function(),
      symbol: z.symbol(),
      nil: z.null(),
      undef: z.undefined(),
      nothing: z.void(),
      never: z.never(),
      unknown: z.unknown(),
    }),
    malformedUnion: { _def: { typeName: "ZodUnion" } },
    malformedOptions: { _def: { typeName: "ZodUnion", options: undefined } },
    malformedTuple: { _def: { typeName: "ZodTuple" } },
    malformedOptional: { _def: { typeName: "ZodOptional" } },
    foreign: { _def: { typeName: undefined } },
    foreignName: { _def: { typeName: "ZodFuture" } },
  };
  const observed = {};
  for (const [name, schema] of Object.entries(schemas)) {
    const before = { ...counts, receivers: counts.receivers.length };
    const record = {};
    for (const [mode, run] of [
      ["schema", () => describeSchema(schema)],
      ["options", () => describeOptions(schema)],
    ]) {
      try {
        record[mode] = run();
      } catch (error) {
        record[mode] = { thrown: String(error.message) };
      }
    }
    record.calls = {
      lazy: counts.lazy - before.lazy,
      factory: counts.factory - before.factory,
      receivers: counts.receivers.slice(before.receivers),
    };
    observed[name] = record;
  }
  Object.assign(observed, observeDefReads(describeSchema));
  return JSON.parse(
    JSON.stringify(observed, (_key, value) =>
      value === undefined ? "__undefined" : value,
    ),
  );
}

function observeDescribe() {
  return describeBattery(
    describeModule.describeSchema,
    describeModule.describeOptions,
  );
}

function observeParser() {
  const { parseValue, parseObject } = dist("utils/internal/value-parser.js");
  const inputs = [
    "true", "false", "null", "undefined", "TRUE", "toString", "constructor",
    "__proto__", "hasOwnProperty", "", " ", "42", "0", "-1.5", "1e3", "NaN",
    "2024-01-01", "2024-01-01T12:00:00Z", '{"a":1}', "[1,2]", "(x) => x", "text",
  ];
  const parsed = inputs.map((input) => {
    const value = parseValue(input);
    return {
      input,
      kind: Object.prototype.toString.call(value),
      json: JSON.stringify(value === undefined ? "__undefined" : value),
    };
  });
  const object = parseObject(inputs.map((input) => ({ key: `k:${input}`, value: input })));
  return { parsed, keys: Object.keys(object) };
}

function observeArchiveRules() {
  const { applyArchiveModeDefaultRules } = dist("base/helpers/archive-mode-helpers.js");
  const rule = { field: "other", equals: 1 };
  const cases = {
    none: undefined,
    empty: {},
    allTrue: { edit: true, duplicate: true, archive: true, restore: true, delete: true },
    allFalse: { edit: false, duplicate: false, archive: false, restore: false, delete: false },
    disabled: { edit: { isEnabled: false }, delete: { isEnabled: false, rule } },
    configured: { edit: { rule }, archive: { isEnabled: true }, restore: { label: "x", rule }, delete: { rule, isVisible: false } },
    withExtras: { details: true, add: false, edit: { icon: "i" } },
    keyOrder: { delete: true, edit: true },
  };
  const observed = {};
  for (const [name, rowActions] of Object.entries(cases)) {
    const result = applyArchiveModeDefaultRules(rowActions, "archived");
    const configured = rowActions?.edit?.rule;
    observed[name] = {
      keys: result === undefined ? null : Object.keys(result),
      json: JSON.stringify(result ?? "__undefined"),
      composedKeepsUserRule:
        result?.edit?.rule?.and?.[1] === configured && configured !== undefined,
    };
  }
  const first = applyArchiveModeDefaultRules({}, "archived");
  const second = applyArchiveModeDefaultRules({}, "archived");
  observed.freshRulePerCall = first.edit.rule !== second.edit.rule;
  observed.distinctRulePerAction = first.edit.rule !== first.duplicate.rule;
  return observed;
}

function observeChoices() {
  const { SelectType } = dist("base/data-types/default/choices.js");
  const observed = {};
  for (const [name, options] of Object.entries({
    single: { items: [{ value: "a", label: "A" }, { value: 2, label: "B" }] },
    multiple: { multiple: true, items: [{ value: "a", label: "A" }, { value: true, label: "B" }] },
    emptySingle: { items: [] },
    emptyMultiple: { multiple: true, items: [] },
  })) {
    const entries = [];
    const type = new SelectType(options);
    for (const input of ["a", "2", 2, "true", ["a"], ["a", "b"], [], undefined]) {
      try {
        entries.push(JSON.stringify(type.getValidation().parse(input)) ?? "__undefined");
      } catch (error) {
        entries.push(`rejected:${error.constructor.name}`);
      }
    }
    observed[name] = entries;
  }
  return observed;
}

async function observeFormPages() {
  const helpers = dist("base/table-view/internal/factory-helpers.js");
  const reads = [];
  const watch = (target, label) =>
    new Proxy(target, {
      get(inner, key, receiver) {
        reads.push(`${label}.${String(key)}`);
        return Reflect.get(inner, key, receiver);
      },
    });
  const observed = {};
  for (const [name, pages] of Object.entries({
    none: undefined,
    empty: {},
    slugs: { new: { urlSlug: "create" }, edit: { urlSlug: "change/:id" }, details: { urlSlug: "show/:id" } },
    partial: { edit: { urlSlug: "x" } },
    blank: { new: { urlSlug: "" } },
  })) {
    reads.length = 0;
    const urls = helpers.buildFormPageUrls("/page//base", "table", pages && watch(pages, name));
    observed[name] = { urls, keys: Object.keys(urls), reads: reads.slice() };
  }
  observed.kinds = helpers.FORM_PAGE_KINDS;
  const { resolveTableViewGrants } = dist("base/table-view/internal/request-filter.js");
  const permissions = dist("permissions.js");
  const original = permissions.HasPermission;
  const asked = [];
  permissions.HasPermission = async (granted, id) => {
    asked.push(`${id}:start`);
    await Promise.resolve();
    asked.push(`${id}:end`);
    return granted.has(id);
  };
  try {
    const grants = await resolveTableViewGrants(new Set(["p.add", "p.view", "p.export"]), "p");
    observed.grants = { grants, keys: Object.keys(grants), asked };
  } finally {
    permissions.HasPermission = original;
  }
  return observed;
}

async function observeReceivers() {
  const { authorizeAction } = dist("base/table-view/internal/auth.js");
  const { getTableViewMetaFor } = dist("base/table-view/internal/meta.js");
  const { ArchiveField } = dist("base/table-view/meta.js");
  const observed = {};
  const reads = [];
  class Controller {}
  const receiver = new Proxy(Object.create(Controller.prototype), {
    get(target, key, self) {
      reads.push(String(key));
      return Reflect.get(target, key, self);
    },
  });
  const meta = getTableViewMetaFor(receiver);
  observed.sameMetaPerClass = getTableViewMetaFor(new Controller()) === meta;
  observed.constructorReads = reads.slice();
  reads.length = 0;
  const tenantAccess = dist("tenant-access.js");
  const originalAssert = tenantAccess.AssertTenantAccess;
  tenantAccess.AssertTenantAccess = async () => {
    throw new Error("tenant gate reached");
  };
  const outcomes = [];
  try {
    for (const target of [receiver, {}, { constructor: Controller }, null, undefined, 1, "text"]) {
      try {
        await authorizeAction(target, "list", { _id: "u" }, "tenant");
        outcomes.push("returned");
      } catch (error) {
        outcomes.push(`${error.constructor.name}:${String(error.message).slice(0, 60)}`);
      }
    }
  } finally {
    tenantAccess.AssertTenantAccess = originalAssert;
  }
  observed.authorize = outcomes;
  observed.authorizeReads = reads.slice();
  const archived = [];
  class Archiving {}
  for (const key of ["archivedAt", Symbol.for("sym"), 7]) {
    try {
      ArchiveField()(Archiving.prototype, key);
      archived.push(`ok:${String(key)}`);
    } catch (error) {
      archived.push(`${error.constructor.name}:${String(error.message).slice(0, 60)}`);
    }
  }
  observed.archiveField = archived;
  observed.archiveFieldSet = getTableViewMetaFor(new Archiving()).archiveField ?? null;
  return observed;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function negativeControls() {
  const controls = {};
  const real = observeParser();
  const mutated = JSON.parse(JSON.stringify(real));
  mutated.parsed[0].json = "false";
  controls.parserDetectsChangedKeyword = !sameJson(real, mutated);

  const reordered = describeBattery(
    (schema) => describeModule.describeSchema(schema),
    (schema) => describeModule.describeOptions(schema),
  );
  const twiceLazy = JSON.parse(JSON.stringify(reordered));
  twiceLazy.lazy.calls.lazy += 1;
  controls.describeDetectsExtraGetterCall = !sameJson(reordered, twiceLazy);
  const readsMoved = JSON.parse(JSON.stringify(reordered));
  readsMoved["reads:optionalString"].reverse();
  controls.describeDetectsReadOrder =
    reordered["reads:optionalString"].length > 1 &&
    !sameJson(reordered, readsMoved);
  assert.ok(Object.values(controls).every(Boolean), JSON.stringify(controls));
  return controls;
}

async function main() {
  const observations = {};
  for (const [name, run] of Object.entries({ describe: observeDescribe, parser: observeParser, archiveRules: observeArchiveRules, choices: observeChoices, formPages: observeFormPages, receivers: observeReceivers })) {
    observations[name] = await run();
  }
  observations.controls = negativeControls();
  process.stdout.write(`${JSON.stringify(observations)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
