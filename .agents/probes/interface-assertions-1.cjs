const path = require("node:path");
const assert = require("node:assert/strict");
const { createRequire } = require("node:module");

const root = process.argv[2];
const packageDir = path.join(root, "packages/interface-dms");
const load = createRequire(path.join(packageDir, "package.json"));

/**
 * @typedef {{
 *   "./dist/base/block-registry/internal/describe.js": typeof import("../../packages/interface-dms/dist/base/block-registry/internal/describe.js");
 *   "./dist/utils/internal/value-parser.js": typeof import("../../packages/interface-dms/dist/utils/internal/value-parser.js");
 *   "./dist/base/helpers/archive-mode-helpers.js": typeof import("../../packages/interface-dms/dist/base/helpers/archive-mode-helpers.js");
 *   "./dist/base/data-types/default/choices.js": typeof import("../../packages/interface-dms/dist/base/data-types/default/choices.js");
 *   "./dist/base/table-view/internal/factory-helpers.js": typeof import("../../packages/interface-dms/dist/base/table-view/internal/factory-helpers.js");
 *   "./dist/base/table-view/internal/request-filter.js": typeof import("../../packages/interface-dms/dist/base/table-view/internal/request-filter.js");
 *   "./dist/permissions.js": typeof import("../../packages/interface-dms/dist/permissions.js");
 *   "./dist/base/table-view/internal/auth.js": typeof import("../../packages/interface-dms/dist/base/table-view/internal/auth.js");
 *   "./dist/base/table-view/internal/meta.js": typeof import("../../packages/interface-dms/dist/base/table-view/internal/meta.js");
 *   "./dist/base/table-view/meta.js": typeof import("../../packages/interface-dms/dist/base/table-view/meta.js");
 *   "./dist/tenant-access.js": typeof import("../../packages/interface-dms/dist/tenant-access.js");
 *   "zod": typeof import("../../packages/interface-dms/node_modules/zod");
 * }} BuiltModules
 */

/**
 * The one place this probe reads built interface-dms output: each entry is typed by the declaration the build emits next to it.
 * @template {keyof BuiltModules} Entry
 * @param {Entry} entry
 * @returns {BuiltModules[Entry]}
 */
function loadBuilt(entry) {
  return load(entry);
}

const { z } = loadBuilt("zod");

const describeModule = loadBuilt("./dist/base/block-registry/internal/describe.js");

/**
 * The one place this probe decodes serialized observations: JSON text holds values of no declared shape.
 * @param {string} text
 * @returns {unknown}
 */
function parseJson(text) {
  return JSON.parse(text);
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isJsonObject(value) {
  return value instanceof Object && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function asObject(value) {
  if (isJsonObject(value)) return value;
  throw new TypeError("Expected a JSON object");
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
function asArray(value) {
  if (Array.isArray(value)) return value;
  throw new TypeError("Expected a JSON array");
}

/**
 * Reads through a proxy exactly as a proxy without a `get` trap would.
 * @param {object} target
 * @param {PropertyKey} key
 * @param {unknown} receiver
 * @returns {unknown}
 */
function forwardRead(target, key, receiver) {
  return Reflect.get(target, key, receiver);
}

/**
 * @param {{ _def: object }} schema
 * @param {string[]} log
 * @param {string} label
 */
function recordDefReads(schema, log, label) {
  const proxy = new Proxy(schema._def, {
    get(target, key, receiver) {
      log.push(`${label}.${String(key)}`);
      return forwardRead(target, key, receiver);
    },
  });
  const view = {};
  Object.setPrototypeOf(view, schema);
  return Object.defineProperty(view, "_def", { value: proxy });
}

/**
 * @param {(schema: unknown) => unknown} describeSchema
 * @returns {Record<string, string[]>}
 */
function observeDefReads(describeSchema) {
  /** @type {Record<string, string[]>} */
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
    /** @type {string[]} */
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

/**
 * @param {(schema: unknown) => unknown} describeSchema
 * @param {(schema: unknown) => unknown} describeOptions
 * @returns {unknown}
 */
function describeBattery(describeSchema, describeOptions) {
  /** @type {{ lazy: number, factory: number, receivers: boolean[] }} */
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
  /** @type {Record<string, unknown>} */
  const observed = {};
  for (const [name, schema] of Object.entries(schemas)) {
    const before = { ...counts, receivers: counts.receivers.length };
    /** @type {Record<string, unknown>} */
    const record = {};
    for (const [mode, run] of /** @type {const} */ ([
      ["schema", () => describeSchema(schema)],
      ["options", () => describeOptions(schema)],
    ])) {
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
  return parseJson(
    JSON.stringify(observed, (_key, /** @type {unknown} */ value) =>
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
  const { parseValue, parseObject } = loadBuilt("./dist/utils/internal/value-parser.js");
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

/**
 * @param {unknown} rowActions
 * @returns {unknown}
 */
function userEditRule(rowActions) {
  if (!(rowActions instanceof Object) || !("edit" in rowActions) || !(rowActions.edit instanceof Object)) return undefined;
  return "rule" in rowActions.edit ? rowActions.edit.rule : undefined;
}

function observeArchiveRules() {
  const { applyArchiveModeDefaultRules } = loadBuilt("./dist/base/helpers/archive-mode-helpers.js");
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
  /** @type {Record<string, unknown>} */
  const observed = {};
  for (const [name, rowActions] of Object.entries(cases)) {
    const result = applyArchiveModeDefaultRules(rowActions, "archived");
    const configured = userEditRule(rowActions);
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
  const { SelectType } = loadBuilt("./dist/base/data-types/default/choices.js");
  /** @type {Record<string, unknown>} */
  const observed = {};
  for (const [name, options] of Object.entries({
    single: { items: [{ value: "a", label: "A" }, { value: 2, label: "B" }] },
    multiple: { multiple: true, items: [{ value: "a", label: "A" }, { value: true, label: "B" }] },
    emptySingle: { items: [] },
    emptyMultiple: { multiple: true, items: [] },
  })) {
    /** @type {string[]} */
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
  const helpers = loadBuilt("./dist/base/table-view/internal/factory-helpers.js");
  /** @type {string[]} */
  const reads = [];
  const watch = (/** @type {object} */ target, /** @type {string} */ label) =>
    new Proxy(target, {
      get(inner, key, receiver) {
        reads.push(`${label}.${String(key)}`);
        return forwardRead(inner, key, receiver);
      },
    });
  /** @type {Record<string, unknown>} */
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
  const { resolveTableViewGrants } = loadBuilt("./dist/base/table-view/internal/request-filter.js");
  const permissions = loadBuilt("./dist/permissions.js");
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
  const { authorizeAction } = loadBuilt("./dist/base/table-view/internal/auth.js");
  const { getTableViewMetaFor } = loadBuilt("./dist/base/table-view/internal/meta.js");
  const { ArchiveField } = loadBuilt("./dist/base/table-view/meta.js");
  /** @type {Record<string, unknown>} */
  const observed = {};
  /** @type {string[]} */
  const reads = [];
  class Controller {}
  const bare = {};
  Object.setPrototypeOf(bare, Controller.prototype);
  const receiver = new Proxy(bare, {
    get(target, key, self) {
      reads.push(String(key));
      return forwardRead(target, key, self);
    },
  });
  const meta = getTableViewMetaFor(receiver);
  observed.sameMetaPerClass = getTableViewMetaFor(new Controller()) === meta;
  observed.constructorReads = reads.slice();
  reads.length = 0;
  const tenantAccess = loadBuilt("./dist/tenant-access.js");
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

/**
 * @param {unknown} left
 * @param {unknown} right
 */
function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function negativeControls() {
  /** @type {Record<string, boolean>} */
  const controls = {};
  const real = observeParser();
  const mutated = structuredClone(real);
  mutated.parsed[0].json = "false";
  controls.parserDetectsChangedKeyword = !sameJson(real, mutated);

  const reordered = describeBattery(
    (schema) => describeModule.describeSchema(schema),
    (schema) => describeModule.describeOptions(schema),
  );
  const twiceLazy = asObject(parseJson(JSON.stringify(reordered)));
  const lazyCalls = asObject(asObject(twiceLazy.lazy).calls);
  lazyCalls.lazy = Number(lazyCalls.lazy) + 1;
  controls.describeDetectsExtraGetterCall = !sameJson(reordered, twiceLazy);
  const readsMoved = asObject(parseJson(JSON.stringify(reordered)));
  asArray(readsMoved["reads:optionalString"]).reverse();
  controls.describeDetectsReadOrder =
    asArray(asObject(reordered)["reads:optionalString"]).length > 1 &&
    !sameJson(reordered, readsMoved);
  assert.ok(Object.values(controls).every(Boolean), JSON.stringify(controls));
  return controls;
}

async function main() {
  /** @type {Record<string, unknown>} */
  const observations = {};
  for (const [name, run] of Object.entries({ describe: observeDescribe, parser: observeParser, archiveRules: observeArchiveRules, choices: observeChoices, formPages: observeFormPages, receivers: observeReceivers })) {
    observations[name] = await run();
  }
  observations.controls = negativeControls();
  process.stdout.write(`${JSON.stringify(observations)}\n`);
}

main().catch((/** @type {unknown} */ error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
