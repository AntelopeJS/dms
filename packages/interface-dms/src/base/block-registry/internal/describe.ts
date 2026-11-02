import {
  type ZodArrayDef,
  type ZodBrandedDef,
  type ZodCatchDef,
  type ZodDefaultDef,
  type ZodDiscriminatedUnionDef,
  type ZodDiscriminatedUnionOption,
  type ZodEffectsDef,
  type ZodEnumDef,
  ZodFirstPartyTypeKind,
  type ZodIntersectionDef,
  type ZodLazyDef,
  type ZodLiteralDef,
  type ZodNativeEnumDef,
  type ZodNullableDef,
  type ZodObjectDef,
  type ZodOptionalDef,
  type ZodPipelineDef,
  type ZodPromiseDef,
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- Zod owns the imported public type name.
  type ZodRawShape,
  type ZodReadonlyDef,
  type ZodRecordDef,
  type ZodTupleDef,
  type ZodTypeAny,
  type ZodTypeDef,
  type ZodUnionDef,
} from "zod";
import type {
  BlockOptionSchema,
  BlockOptionType,
  BlockOptionUi,
  BlockTypeDescriptor,
} from "../types";
import { getUiHints, mergeUiHints } from "./ui";

const MAX_DEPTH = 6;
const MAX_WRAPPERS = 8;

type LiteralValue =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined;

/**
 * The definition of each kind the walker reads fields from, with the schemas
 * it holds typed as schemas. Every other kind is a name and nothing more.
 */
type ZodDef =
  | ZodOptionalDef
  | ZodNullableDef
  | ZodDefaultDef
  | ZodCatchDef
  | ZodReadonlyDef
  | ZodPromiseDef
  | ZodBrandedDef<ZodTypeAny>
  | ZodEffectsDef
  | ZodLazyDef
  | ZodPipelineDef<ZodTypeAny, ZodTypeAny>
  | ZodObjectDef
  | ZodUnionDef
  | ZodDiscriminatedUnionDef<string, ZodDiscriminatedUnionOption<string>[]>
  | ZodArrayDef
  | ZodTupleDef
  | ZodRecordDef
  | ZodIntersectionDef
  | ZodLiteralDef<LiteralValue>
  | ZodEnumDef
  | ZodNativeEnumDef
  | (ZodTypeDef & {
      typeName: Exclude<
        ZodFirstPartyTypeKind,
        | ZodFirstPartyTypeKind.ZodOptional
        | ZodFirstPartyTypeKind.ZodNullable
        | ZodFirstPartyTypeKind.ZodDefault
        | ZodFirstPartyTypeKind.ZodCatch
        | ZodFirstPartyTypeKind.ZodReadonly
        | ZodFirstPartyTypeKind.ZodPromise
        | ZodFirstPartyTypeKind.ZodBranded
        | ZodFirstPartyTypeKind.ZodEffects
        | ZodFirstPartyTypeKind.ZodLazy
        | ZodFirstPartyTypeKind.ZodPipeline
        | ZodFirstPartyTypeKind.ZodObject
        | ZodFirstPartyTypeKind.ZodUnion
        | ZodFirstPartyTypeKind.ZodDiscriminatedUnion
        | ZodFirstPartyTypeKind.ZodArray
        | ZodFirstPartyTypeKind.ZodTuple
        | ZodFirstPartyTypeKind.ZodRecord
        | ZodFirstPartyTypeKind.ZodIntersection
        | ZodFirstPartyTypeKind.ZodLiteral
        | ZodFirstPartyTypeKind.ZodEnum
        | ZodFirstPartyTypeKind.ZodNativeEnum
      >;
    });

type DefOf<Kind extends ZodFirstPartyTypeKind> = Extract<
  ZodDef,
  { typeName: Kind }
>;

interface UnwrapResult {
  schema: ZodTypeAny;
  optional: boolean;
  nullable: boolean;
  /** The wrapper budget ran out before a describable node was reached. */
  exhausted?: boolean;
  defaultValue?: unknown;
  description?: string;
  ui?: BlockOptionUi;
}

/**
 * The accessor of the schema a wrapper kind wraps, `undefined` for any other
 * kind. Nothing is read from the wrapper until the accessor is called.
 */
function innerAccessor(def: ZodDef): (() => ZodTypeAny) | undefined {
  switch (def.typeName) {
    case ZodFirstPartyTypeKind.ZodOptional:
    case ZodFirstPartyTypeKind.ZodNullable:
    case ZodFirstPartyTypeKind.ZodDefault:
    case ZodFirstPartyTypeKind.ZodCatch:
    case ZodFirstPartyTypeKind.ZodReadonly:
      return () => def.innerType;
    case ZodFirstPartyTypeKind.ZodPromise:
    case ZodFirstPartyTypeKind.ZodBranded:
      return () => def.type;
    case ZodFirstPartyTypeKind.ZodEffects:
      return () => def.schema;
    case ZodFirstPartyTypeKind.ZodLazy:
      return () => def.getter();
    case ZodFirstPartyTypeKind.ZodPipeline:
      return () => def.in;
    default:
      return undefined;
  }
}

function defOf(schema: ZodTypeAny): ZodDef {
  return schema._def;
}

/**
 * The walker reads zod 3's internal `_def.typeName`. A zod whose schemas carry
 * none would describe every option as shapeless, which is worse than not
 * answering at all — so say so instead.
 */
function assertDescribable(def: ZodDef): void {
  if (def.typeName === undefined) {
    throw new Error(
      "block-registry: this zod exposes no _def.typeName; the option walker supports zod 3",
    );
  }
}

/** Peel wrappers off a schema, collecting the flags and hints they carry. */
function unwrap(schema: ZodTypeAny): UnwrapResult {
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
    const def = defOf(current);
    descriptions.push(def.description);
    const inner = innerAccessor(def);
    if (!inner) {
      peeled = false;
      break;
    }
    result.optional ||= def.typeName === ZodFirstPartyTypeKind.ZodOptional;
    result.nullable ||= def.typeName === ZodFirstPartyTypeKind.ZodNullable;
    if (def.typeName === ZodFirstPartyTypeKind.ZodDefault) {
      result.defaultValue = def.defaultValue();
    }
    current = inner();
  }
  hints.push(getUiHints(current));
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
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The generic cloning contract accepts every value; only objects need structuredClone and non-cloneable values pass through.
  if (typeof value !== "object" || value === null) {
    return value;
  }
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}

const PRIMITIVE: Partial<Record<ZodFirstPartyTypeKind, BlockOptionType>> = {
  [ZodFirstPartyTypeKind.ZodString]: "string",
  [ZodFirstPartyTypeKind.ZodNumber]: "number",
  [ZodFirstPartyTypeKind.ZodBigInt]: "number",
  [ZodFirstPartyTypeKind.ZodBoolean]: "boolean",
  [ZodFirstPartyTypeKind.ZodDate]: "string",
  [ZodFirstPartyTypeKind.ZodAny]: "unknown",
  [ZodFirstPartyTypeKind.ZodUnknown]: "unknown",
  [ZodFirstPartyTypeKind.ZodNull]: "unknown",
  [ZodFirstPartyTypeKind.ZodUndefined]: "unknown",
  [ZodFirstPartyTypeKind.ZodVoid]: "unknown",
  [ZodFirstPartyTypeKind.ZodNever]: "unknown",
  [ZodFirstPartyTypeKind.ZodSymbol]: "unknown",
  [ZodFirstPartyTypeKind.ZodFunction]: "unknown",
  [ZodFirstPartyTypeKind.ZodMap]: "unknown",
  [ZodFirstPartyTypeKind.ZodSet]: "unknown",
};

/** The kinds whose shape the walker descends into, and what they report as. */
const STRUCTURED_TYPE: Partial<Record<ZodFirstPartyTypeKind, BlockOptionType>> =
  {
    [ZodFirstPartyTypeKind.ZodObject]: "object",
    [ZodFirstPartyTypeKind.ZodArray]: "array",
    [ZodFirstPartyTypeKind.ZodRecord]: "record",
    [ZodFirstPartyTypeKind.ZodTuple]: "array",
    [ZodFirstPartyTypeKind.ZodUnion]: "union",
    [ZodFirstPartyTypeKind.ZodDiscriminatedUnion]: "union",
    [ZodFirstPartyTypeKind.ZodIntersection]: "object",
  };

/**
 * A literal is described by the value it fixes when the descriptor protocol can
 * carry that value as JSON: a string, a boolean or a finite number. A literal
 * JSON cannot hold (null, undefined, a bigint, a symbol, NaN or an infinity)
 * is reported as `unknown` with no `enum`, the same as the schema kinds of
 * those values.
 */
function describeLiteral(
  value: DefOf<ZodFirstPartyTypeKind.ZodLiteral>["value"],
): BlockOptionSchema {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Literal descriptors classify representation without coercing the underlying Zod literal.
  switch (typeof value) {
    case "string":
      return { type: "string", enum: [value] };
    case "boolean":
      return { type: "boolean", enum: [value] };
    case "number":
      return Number.isFinite(value)
        ? { type: "number", enum: [value] }
        : { type: "unknown" };
    default:
      return { type: "unknown" };
  }
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

function describeUnion(
  def: DefOf<
    ZodFirstPartyTypeKind.ZodUnion | ZodFirstPartyTypeKind.ZodDiscriminatedUnion
  >,
  depth: number,
): BlockOptionSchema {
  const options: readonly ZodTypeAny[] = def.options ?? [];
  const branches = options.map((option) => describeSchema(option, depth + 1));
  const merged = mergeLiteralBranches(branches);
  if (merged) {
    return merged;
  }
  const discriminator =
    def.typeName === ZodFirstPartyTypeKind.ZodDiscriminatedUnion
      ? def.discriminator
      : undefined;
  const described: BlockOptionSchema = {
    type: "union",
    oneOf: branches,
  };
  if (discriminator) described.discriminator = discriminator;
  return described;
}

function describeObject(
  def: DefOf<ZodFirstPartyTypeKind.ZodObject>,
  depth: number,
): BlockOptionSchema {
  return {
    type: "object",
    properties: describeProperties(def.shape(), depth + 1),
  };
}

function describeKind(
  def: ZodDef,
  depth: number,
): BlockOptionSchema | undefined {
  switch (def.typeName) {
    case ZodFirstPartyTypeKind.ZodObject:
      return describeObject(def, depth);
    case ZodFirstPartyTypeKind.ZodUnion:
    case ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
      return describeUnion(def, depth);
    case ZodFirstPartyTypeKind.ZodArray:
      return { type: "array", items: describeSchema(def.type, depth + 1) };
    case ZodFirstPartyTypeKind.ZodTuple: {
      const items: ZodTypeAny[] = def.items;
      return {
        type: "array",
        prefixItems: items.map((item) => describeSchema(item, depth + 1)),
      };
    }
    case ZodFirstPartyTypeKind.ZodRecord:
      return {
        type: "record",
        keys: describeSchema(def.keyType, depth + 1),
        values: describeSchema(def.valueType, depth + 1),
      };
    case ZodFirstPartyTypeKind.ZodIntersection:
      return {
        type: "object",
        allOf: [
          describeSchema(def.left, depth + 1),
          describeSchema(def.right, depth + 1),
        ],
      };
    case ZodFirstPartyTypeKind.ZodLiteral:
      return describeLiteral(def.value);
    case ZodFirstPartyTypeKind.ZodEnum:
      return { type: "string", enum: [...def.values] };
    case ZodFirstPartyTypeKind.ZodNativeEnum:
      return { type: "string", enum: Object.values(def.values) };
    default:
      return undefined;
  }
}

/**
 * Describe one option schema as a JSON-serializable shape.
 *
 * @internal
 */
export function describeSchema(
  schema: ZodTypeAny,
  depth = 0,
): BlockOptionSchema {
  const unwrapped = unwrap(schema);
  const def = defOf(unwrapped.schema);
  assertDescribable(def);
  const truncated =
    unwrapped.exhausted === true ||
    (depth >= MAX_DEPTH && def.typeName in STRUCTURED_TYPE);
  const base: BlockOptionSchema = (truncated
    ? undefined
    : describeKind(def, depth)) ?? {
    type: STRUCTURED_TYPE[def.typeName] ?? PRIMITIVE[def.typeName] ?? "unknown",
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
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- Zod owns the imported schema-property type name.
  properties: ZodRawShape,
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
  schema?: ZodTypeAny,
): Record<string, BlockOptionSchema> {
  if (!schema) {
    return {};
  }
  const unwrapped = unwrap(schema);
  const def = defOf(unwrapped.schema);
  if (def.typeName !== ZodFirstPartyTypeKind.ZodObject) {
    return {};
  }
  return describeProperties(def.shape(), 0);
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
  const defaults: Record<string, BlockOptionSchema["default"]> = {};
  for (const [key, option] of Object.entries(described)) {
    if (option.default !== undefined) {
      defaults[key] = option.default;
    }
  }
  // oxlint-disable-next-line anti-slop/no-known-value-widening -- The published return remains an open record of application defaults; values retain BlockOptionSchema.default without parsing or coercion.
  return defaults;
}
