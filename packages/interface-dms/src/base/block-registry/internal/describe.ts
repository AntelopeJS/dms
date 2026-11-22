import { z } from "zod";
import type {
  BlockOptionSchema,
  BlockOptionType,
  BlockOptionUi,
  BlockTypeDescriptor,
} from "../types";
import { getUiHints, mergeUiHints } from "./ui";
import {
  isBoolean,
  isNumber,
  isObject,
  isString,
} from "../../../utils/internal/type-check";

const MAX_DEPTH = 6;
const MAX_WRAPPERS = 8;

/** The definition of a schema, narrowed on its `type`. */
type ZodDef = z.core.$ZodTypes["_zod"]["def"];

type DefOf<Kind extends ZodDef["type"]> = Extract<ZodDef, { type: Kind }>;

interface UnwrapResult {
  schema: z.core.$ZodType;
  optional: boolean;
  nullable: boolean;
  /** The wrapper budget ran out before a describable node was reached. */
  exhausted?: boolean;
  defaultValue?: unknown;
  description?: string;
  ui?: BlockOptionUi;
}

function defOf(schema: z.core.$ZodType): ZodDef {
  // SAFETY: Every schema zod builds is one of the classes `$ZodTypes` lists, each holding the definition its `type` names; a schema of a kind zod adds later reaches the walker's `default` branches, which read no field off it.
  return (schema as z.core.$ZodTypes)._zod.def;
}

/**
 * The accessor of the schema a wrapper kind wraps, `undefined` for any other
 * kind. Nothing is read from the wrapper until the accessor is called. A pipe
 * is described by what it accepts: its input, unless that input is a
 * transform, as `z.preprocess` builds, which accepts anything.
 */
function innerAccessor(def: ZodDef): (() => z.core.$ZodType) | undefined {
  switch (def.type) {
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
    case "nonoptional":
    case "promise":
      return () => def.innerType;
    case "lazy":
      return () => def.getter();
    case "pipe":
      return () => (defOf(def.in).type === "transform" ? def.out : def.in);
    default:
      return undefined;
  }
}

/** The description `.describe()` or `.meta()` gave a schema, if any. */
function descriptionOf(schema: z.core.$ZodType): string | undefined {
  return z.globalRegistry.get(schema)?.description;
}

/** Peel wrappers off a schema, collecting the flags and hints they carry. */
function unwrap(schema: z.core.$ZodType): UnwrapResult {
  const result: UnwrapResult = {
    schema,
    optional: false,
    nullable: false,
  };
  const hints: Array<BlockOptionUi | undefined> = [];
  const descriptions: Array<string | undefined> = [];
  let current = schema;
  let peeled = true;
  for (let step = 0; step < MAX_WRAPPERS && peeled; step++) {
    hints.push(getUiHints(current));
    descriptions.push(descriptionOf(current));
    const def = defOf(current);
    const inner = innerAccessor(def);
    if (!inner) {
      peeled = false;
      break;
    }
    result.optional ||= def.type === "optional";
    result.nullable ||= def.type === "nullable";
    if (def.type === "default") {
      result.defaultValue = def.defaultValue;
    }
    current = inner();
  }
  hints.push(getUiHints(current));
  descriptions.push(descriptionOf(current));
  result.exhausted = peeled && innerAccessor(defOf(current)) !== undefined;
  result.schema = current;
  result.ui = mergeUiHints(hints);
  result.description = descriptions.find((entry) => !!entry);
  return result;
}

/**
 * A copy of a default value, so freezing a descriptor never reaches an object
 * zod also holds — `.default(obj)` hands back that very instance on every
 * parse, and a frozen one is unwritable for every consumer of the schema.
 *
 * `structuredClone` is used because it reproduces a `Date`, a `RegExp`, a `Map`
 * and a `Set`; copying own properties, as a hand-rolled walk does, flattens
 * every one of those to `{}`. A value it cannot clone — a function, a class
 * instance — is not a describable default, and is passed through rather than
 * lost.
 *
 * @internal
 */
export function cloneDefault<T>(value: T): T {
  if (!isObject(value) || value === null) {
    return value;
  }
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

const PRIMITIVE: Partial<Record<ZodDef["type"], BlockOptionType>> = {
  string: "string",
  template_literal: "string",
  number: "number",
  bigint: "number",
  boolean: "boolean",
  date: "string",
};

/** The kinds whose shape the walker descends into, and what they report as. */
const STRUCTURED_TYPE: Partial<Record<ZodDef["type"], BlockOptionType>> = {
  object: "object",
  array: "array",
  record: "record",
  tuple: "array",
  union: "union",
  intersection: "object",
};

/**
 * A literal is described by the value it fixes when the descriptor protocol can
 * carry that value as JSON: a string, a boolean or a finite number. A literal
 * JSON cannot hold (null, undefined, a bigint, a symbol, NaN or an infinity)
 * is reported as `unknown` with no `enum`, the same as the schema kinds of
 * those values.
 */
function describeLiteralValue(
  value: DefOf<"literal">["values"][number],
): BlockOptionSchema {
  if (isString(value)) return { type: "string", enum: [value] };
  if (isBoolean(value)) return { type: "boolean", enum: [value] };
  if (isNumber(value) && Number.isFinite(value)) {
    return { type: "number", enum: [value] };
  }
  return { type: "unknown" };
}

/** Collapse a union of single-value enums into one enum, as a picker wants it. */
function mergeLiteralBranches(
  branches: BlockOptionSchema[],
): BlockOptionSchema | undefined {
  const values: Array<string | number | boolean> = [];
  for (const branch of branches) {
    if (!branch.enum || branch.enum.length === 0) {
      return undefined;
    }
    values.push(...branch.enum);
  }
  const types = new Set(branches.map((branch) => branch.type));
  if (types.size !== 1) {
    return undefined;
  }
  return { type: branches[0].type, enum: values };
}

function describeUnion(def: DefOf<"union">, depth: number): BlockOptionSchema {
  const branches = def.options.map((option) =>
    describeSchema(option, depth + 1),
  );
  const merged = mergeLiteralBranches(branches);
  if (merged) {
    return merged;
  }
  const described: BlockOptionSchema = {
    type: "union",
    oneOf: branches,
  };
  if ("discriminator" in def && isString(def.discriminator)) {
    described.discriminator = def.discriminator;
  }
  return described;
}

function describeLiteral(def: DefOf<"literal">): BlockOptionSchema {
  const branches = def.values.map(describeLiteralValue);
  return (
    (branches.length === 1 ? branches[0] : mergeLiteralBranches(branches)) ?? {
      type: "unknown",
    }
  );
}

function describeKind(
  def: ZodDef,
  depth: number,
): BlockOptionSchema | undefined {
  switch (def.type) {
    case "object":
      return {
        type: "object",
        properties: describeProperties(def.shape, depth + 1),
      };
    case "union":
      return describeUnion(def, depth);
    case "array":
      return { type: "array", items: describeSchema(def.element, depth + 1) };
    case "tuple":
      return {
        type: "array",
        prefixItems: def.items.map((item) => describeSchema(item, depth + 1)),
      };
    case "record":
      return {
        type: "record",
        keys: describeSchema(def.keyType, depth + 1),
        values: describeSchema(def.valueType, depth + 1),
      };
    case "intersection":
      return {
        type: "object",
        allOf: [
          describeSchema(def.left, depth + 1),
          describeSchema(def.right, depth + 1),
        ],
      };
    case "literal":
      return describeLiteral(def);
    case "enum":
      return {
        type: "string",
        enum: z.core.util.getEnumValues(def.entries),
      };
    default:
      return undefined;
  }
}

/**
 * The walker reads zod 4's `_zod.def`. A schema built by another zod major
 * carries none, and would be described as nothing at all, so say so instead.
 */
function assertDescribable(schema: z.core.$ZodType): void {
  if (!isObject(schema._zod) || schema._zod === null) {
    throw new Error(
      "block-registry: this schema exposes no _zod.def; the option walker supports zod 4",
    );
  }
}

/**
 * Describe one option schema as a JSON-serializable shape.
 *
 * @internal
 */
export function describeSchema(
  schema: z.core.$ZodType,
  depth = 0,
): BlockOptionSchema {
  assertDescribable(schema);
  const unwrapped = unwrap(schema);
  const def = defOf(unwrapped.schema);
  const truncated =
    unwrapped.exhausted === true ||
    (depth >= MAX_DEPTH && def.type in STRUCTURED_TYPE);
  const base: BlockOptionSchema = (truncated
    ? undefined
    : describeKind(def, depth)) ?? {
    type: STRUCTURED_TYPE[def.type] ?? PRIMITIVE[def.type] ?? "unknown",
  };
  if (truncated) base.truncated = true;
  if (unwrapped.optional) base.optional = true;
  if (unwrapped.nullable) base.nullable = true;
  if (unwrapped.defaultValue !== undefined)
    base.default = cloneDefault(unwrapped.defaultValue);
  if (unwrapped.description) base.description = unwrapped.description;
  if (unwrapped.ui) base.ui = unwrapped.ui;
  return base;
}

function describeProperties(
  properties: Readonly<Record<string, z.core.$ZodType>>,
  depth: number,
): BlockTypeDescriptor["config"] {
  const described: Record<string, BlockOptionSchema> = {};
  for (const [key, value] of Object.entries(properties)) {
    described[key] = describeSchema(value, depth);
  }
  return described;
}

/**
 * Describe a block's whole options schema. A non-object schema yields an empty
 * record, since a block's options are always a plain object.
 *
 * @internal
 */
export function describeOptions(
  schema?: z.core.$ZodType,
): Record<string, BlockOptionSchema> {
  if (!schema) {
    return {};
  }
  assertDescribable(schema);
  const def = defOf(unwrap(schema).schema);
  if (def.type !== "object") {
    return {};
  }
  return describeProperties(def.shape, 0);
}

/**
 * The default value of every option that declares one.
 *
 * @internal
 */
export function collectDefaults(
  described: Record<string, BlockOptionSchema>,
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Published defaults contain arbitrary application values, matching BlockOptionSchema.default.
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(described).flatMap(([key, option]) =>
      option.default === undefined ? [] : [[key, option.default]],
    ),
  );
}
