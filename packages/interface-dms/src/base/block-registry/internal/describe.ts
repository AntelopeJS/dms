// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- Zod owns the imported public type name.
import { ZodFirstPartyTypeKind, type ZodRawShape, type ZodTypeAny } from "zod";
import type {
  BlockOptionSchema,
  BlockOptionType,
  BlockOptionUi,
  BlockTypeDescriptor,
} from "../types";
import { getUiHints, mergeUiHints } from "./ui";

const MAX_DEPTH = 6;
const MAX_WRAPPERS = 8;

interface ZodDefLike {
  typeName: ZodFirstPartyTypeKind;
  description?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Zod 3 private definitions vary by kind; the walker dispatches before reading their unchecked members.
  [key: string]: unknown;
}

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

type InnerAccessor = (def: ZodDefLike) => ZodTypeAny;

const WRAPPER_INNER: Partial<Record<ZodFirstPartyTypeKind, InnerAccessor>> = {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Dispatch selects ZodOptional; the private innerType member is not validated by this descriptor API.
  [ZodFirstPartyTypeKind.ZodOptional]: (def) => def.innerType as ZodTypeAny,
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Dispatch selects ZodNullable; the private innerType member is not validated by this descriptor API.
  [ZodFirstPartyTypeKind.ZodNullable]: (def) => def.innerType as ZodTypeAny,
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Dispatch selects ZodDefault; the private innerType member is not validated by this descriptor API.
  [ZodFirstPartyTypeKind.ZodDefault]: (def) => def.innerType as ZodTypeAny,
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Dispatch selects ZodCatch; the private innerType member is not validated by this descriptor API.
  [ZodFirstPartyTypeKind.ZodCatch]: (def) => def.innerType as ZodTypeAny,
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Dispatch selects ZodReadonly; the private innerType member is not validated by this descriptor API.
  [ZodFirstPartyTypeKind.ZodReadonly]: (def) => def.innerType as ZodTypeAny,
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Dispatch selects ZodPromise; the private type member is not validated by this descriptor API.
  [ZodFirstPartyTypeKind.ZodPromise]: (def) => def.type as ZodTypeAny,
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Dispatch selects ZodBranded; the private type member is not validated by this descriptor API.
  [ZodFirstPartyTypeKind.ZodBranded]: (def) => def.type as ZodTypeAny,
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Dispatch selects ZodEffects; the private schema member is not validated by this descriptor API.
  [ZodFirstPartyTypeKind.ZodEffects]: (def) => def.schema as ZodTypeAny,
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Dispatch selects ZodLazy; the private getter is called without validating its result, as before.
  [ZodFirstPartyTypeKind.ZodLazy]: (def) => (def.getter as () => ZodTypeAny)(),
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Dispatch selects ZodPipeline; the private input member is not validated by this descriptor API.
  [ZodFirstPartyTypeKind.ZodPipeline]: (def) => def.in as ZodTypeAny,
};

function defOf(schema: ZodTypeAny): ZodDefLike {
  return schema._def;
}

/**
 * The walker reads zod 3's internal `_def.typeName`. A zod whose schemas carry
 * none would describe every option as shapeless, which is worse than not
 * answering at all — so say so instead.
 */
function assertDescribable(def: ZodDefLike): void {
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
    const inner = WRAPPER_INNER[def.typeName];
    if (!inner) {
      peeled = false;
      break;
    }
    result.optional ||= def.typeName === ZodFirstPartyTypeKind.ZodOptional;
    result.nullable ||= def.typeName === ZodFirstPartyTypeKind.ZodNullable;
    if (def.typeName === ZodFirstPartyTypeKind.ZodDefault) {
      result.defaultValue =
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The Zod 3 default factory can return any application value; descriptors preserve that value rather than parse it.
        (def.defaultValue as () => UnwrapResult["defaultValue"])();
    }
    current = inner(def);
  }
  hints.push(getUiHints(current));
  result.exhausted =
    peeled && WRAPPER_INNER[defOf(current).typeName] !== undefined;
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

type Handler = (def: ZodDefLike, depth: number) => BlockOptionSchema;

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
function describeLiteral(value: ZodDefLike["value"]): BlockOptionSchema {
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

function describeUnion(def: ZodDefLike, depth: number): BlockOptionSchema {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Union dispatch assumes Zod 3 private options; validation here would change descriptor failure behavior.
  const options = (def.options as ZodTypeAny[]) ?? [];
  const branches = options.map((option) => describeSchema(option, depth + 1));
  const merged = mergeLiteralBranches(branches);
  if (merged) {
    return merged;
  }
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Plain unions have no discriminator; discriminated unions supply this private string member without further validation.
  const discriminator = def.discriminator as string | undefined;
  const described: BlockOptionSchema = {
    type: "union",
    oneOf: branches,
  };
  if (discriminator) described.discriminator = discriminator;
  return described;
}

function describeObject(def: ZodDefLike, depth: number): BlockOptionSchema {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-shape-in-symbol-names -- Object dispatch calls Zod 3's private shape factory; the definition and upstream type name remain unchecked.
  const properties = (def.shape as () => ZodRawShape)();
  return {
    type: "object",
    properties: describeProperties(properties, depth + 1),
  };
}

const HANDLERS: Partial<Record<ZodFirstPartyTypeKind, Handler>> = {
  [ZodFirstPartyTypeKind.ZodObject]: describeObject,
  [ZodFirstPartyTypeKind.ZodUnion]: describeUnion,
  [ZodFirstPartyTypeKind.ZodDiscriminatedUnion]: describeUnion,
  [ZodFirstPartyTypeKind.ZodArray]: (def, depth) => ({
    type: "array",
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Array dispatch assumes Zod 3's private element schema; parsing it would change descriptor behavior.
    items: describeSchema(def.type as ZodTypeAny, depth + 1),
  }),
  [ZodFirstPartyTypeKind.ZodTuple]: (def, depth) => ({
    type: "array",
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Tuple dispatch assumes Zod 3's private item schemas without validating the definition.
    prefixItems: (def.items as ZodTypeAny[]).map((item) =>
      describeSchema(item, depth + 1),
    ),
  }),
  [ZodFirstPartyTypeKind.ZodRecord]: (def, depth) => ({
    type: "record",
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Record dispatch assumes Zod 3's private key schema without validating the definition.
    keys: describeSchema(def.keyType as ZodTypeAny, depth + 1),
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Record dispatch assumes Zod 3's private value schema without validating the definition.
    values: describeSchema(def.valueType as ZodTypeAny, depth + 1),
  }),
  [ZodFirstPartyTypeKind.ZodIntersection]: (def, depth) => ({
    type: "object",
    allOf: [
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Intersection dispatch assumes Zod 3's private left schema without validating the definition.
      describeSchema(def.left as ZodTypeAny, depth + 1),
      // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Intersection dispatch assumes Zod 3's private right schema without validating the definition.
      describeSchema(def.right as ZodTypeAny, depth + 1),
    ],
  }),
  [ZodFirstPartyTypeKind.ZodLiteral]: (def) => describeLiteral(def.value),
  [ZodFirstPartyTypeKind.ZodEnum]: (def) => ({
    type: "string",
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Enum dispatch assumes Zod 3's private string values without validating the definition.
    enum: def.values as string[],
  }),
  [ZodFirstPartyTypeKind.ZodNativeEnum]: (def) => ({
    type: "string",
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Native-enum dispatch assumes Zod 3's private enum object without validating the definition.
    enum: Object.values(def.values as Record<string, string | number>),
  }),
};

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
  const handler = truncated ? undefined : HANDLERS[def.typeName];
  const base: BlockOptionSchema = handler
    ? handler(def, depth)
    : {
        type:
          STRUCTURED_TYPE[def.typeName] ?? PRIMITIVE[def.typeName] ?? "unknown",
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
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-shape-in-symbol-names -- ZodObject dispatch calls its private shape factory without validating the definition; Zod owns the type name.
  return describeProperties((def.shape as () => ZodRawShape)(), 0);
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
