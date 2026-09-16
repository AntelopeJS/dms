import { ZodFirstPartyTypeKind, type ZodRawShape, type ZodTypeAny } from "zod";
import type {
  BlockOptionSchema,
  BlockOptionType,
  BlockOptionUi,
} from "./types";
import { getUiHints, mergeUiHints } from "./ui";

const MAX_DEPTH = 6;
// Wrappers nest independently of the shape's depth: optional-of-default-of-
// nullable is three peels around a single node.
const MAX_WRAPPERS = 8;

interface ZodDefLike {
  typeName: ZodFirstPartyTypeKind;
  description?: string;
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
  [ZodFirstPartyTypeKind.ZodOptional]: (def) => def.innerType as ZodTypeAny,
  [ZodFirstPartyTypeKind.ZodNullable]: (def) => def.innerType as ZodTypeAny,
  [ZodFirstPartyTypeKind.ZodDefault]: (def) => def.innerType as ZodTypeAny,
  [ZodFirstPartyTypeKind.ZodCatch]: (def) => def.innerType as ZodTypeAny,
  [ZodFirstPartyTypeKind.ZodReadonly]: (def) => def.innerType as ZodTypeAny,
  [ZodFirstPartyTypeKind.ZodPromise]: (def) => def.type as ZodTypeAny,
  [ZodFirstPartyTypeKind.ZodBranded]: (def) => def.type as ZodTypeAny,
  [ZodFirstPartyTypeKind.ZodEffects]: (def) => def.schema as ZodTypeAny,
  [ZodFirstPartyTypeKind.ZodLazy]: (def) => (def.getter as () => ZodTypeAny)(),
  // The registry validates what a caller passes, so a pipeline describes its
  // input rather than what it transforms into.
  [ZodFirstPartyTypeKind.ZodPipeline]: (def) => def.in as ZodTypeAny,
};

function defOf(schema: ZodTypeAny): ZodDefLike {
  return schema._def as ZodDefLike;
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
      result.defaultValue = (def.defaultValue as () => unknown)();
    }
    current = inner(def);
  }
  // The loop reads hints at the top of each turn, so the node it stops on has
  // not been read yet — at exactly the budget its hints would be lost.
  hints.push(getUiHints(current));
  // Still on a wrapper: the budget ran out rather than the walk finishing, and
  // the node below is never described. Saying so beats reporting a shape that
  // reads as "no structure".
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
 */
export function cloneDefault<T>(value: T): T {
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

function literalType(value: unknown): BlockOptionType {
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  return "string";
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
  const options = (def.options as ZodTypeAny[]) ?? [];
  const branches = options.map((option) => describeSchema(option, depth + 1));
  const merged = mergeLiteralBranches(branches);
  if (merged) {
    return merged;
  }
  const discriminator = def.discriminator as string | undefined;
  // The branches disagree on kind, so the union has none of its own: a consumer
  // switches on `oneOf` rather than on `type`.
  const described: BlockOptionSchema = {
    type: "union",
    oneOf: branches,
  };
  if (discriminator) described.discriminator = discriminator;
  return described;
}

function describeObject(def: ZodDefLike, depth: number): BlockOptionSchema {
  const shape = (def.shape as () => ZodRawShape)();
  return { type: "object", properties: describeShape(shape, depth + 1) };
}

const HANDLERS: Partial<Record<ZodFirstPartyTypeKind, Handler>> = {
  [ZodFirstPartyTypeKind.ZodObject]: describeObject,
  [ZodFirstPartyTypeKind.ZodUnion]: describeUnion,
  [ZodFirstPartyTypeKind.ZodDiscriminatedUnion]: describeUnion,
  [ZodFirstPartyTypeKind.ZodArray]: (def, depth) => ({
    type: "array",
    items: describeSchema(def.type as ZodTypeAny, depth + 1),
  }),
  [ZodFirstPartyTypeKind.ZodTuple]: (def, depth) => ({
    type: "array",
    prefixItems: (def.items as ZodTypeAny[]).map((item) =>
      describeSchema(item, depth + 1),
    ),
  }),
  [ZodFirstPartyTypeKind.ZodRecord]: (def, depth) => ({
    type: "record",
    values: describeSchema(def.valueType as ZodTypeAny, depth + 1),
  }),
  [ZodFirstPartyTypeKind.ZodIntersection]: (def, depth) => ({
    type: "object",
    allOf: [
      describeSchema(def.left as ZodTypeAny, depth + 1),
      describeSchema(def.right as ZodTypeAny, depth + 1),
    ],
  }),
  [ZodFirstPartyTypeKind.ZodLiteral]: (def) => ({
    type: literalType(def.value),
    enum: [def.value as string | number],
  }),
  [ZodFirstPartyTypeKind.ZodEnum]: (def) => ({
    type: "string",
    enum: def.values as string[],
  }),
  [ZodFirstPartyTypeKind.ZodNativeEnum]: (def) => ({
    type: "string",
    enum: Object.values(def.values as Record<string, string | number>),
  }),
};

/** Describe one option schema as a JSON-serializable shape. */
export function describeSchema(
  schema: ZodTypeAny,
  depth = 0,
): BlockOptionSchema {
  const unwrapped = unwrap(schema);
  const def = defOf(unwrapped.schema);
  assertDescribable(def);
  // Past the depth bound the shape is not walked, but its kind is still known:
  // reporting `unknown` would read as "no structure" rather than "more below".
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

function describeShape(
  shape: ZodRawShape,
  depth: number,
): Record<string, BlockOptionSchema> {
  const described: Record<string, BlockOptionSchema> = {};
  for (const [key, value] of Object.entries(shape)) {
    described[key] = describeSchema(value as ZodTypeAny, depth);
  }
  return described;
}

/**
 * Describe a block's whole options schema. A non-object schema yields an empty
 * record, since a block's options are always a plain object.
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
  return describeShape((def.shape as () => ZodRawShape)(), 0);
}

/** The default value of every option that declares one. */
export function collectDefaults(
  described: Record<string, BlockOptionSchema>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [key, option] of Object.entries(described)) {
    if (option.default !== undefined) {
      defaults[key] = option.default;
    }
  }
  return defaults;
}
