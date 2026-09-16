import type { ZodTypeAny } from "zod";
import { cloneDefault, collectDefaults, describeOptions } from "./describe";
import type { BlockTypeDefinition, BlockTypeDescriptor } from "./types";

const DEFINITIONS = new Map<string, BlockTypeDefinition>();
const DESCRIPTORS = new Map<string, BlockTypeDescriptor>();

/**
 * Declare a block type so builder tooling can list, describe and validate it.
 * Called once per factory, next to the factory itself.
 *
 * A second registration under a name already taken replaces the first, which
 * would let a third-party module quietly stand in for a core block. It is
 * allowed, because a module reloaded in development re-runs its registrations,
 * but it is reported so the collision is not silent.
 */
export function RegisterBlockType(definition: BlockTypeDefinition): void {
  const previous = DEFINITIONS.get(definition.type);
  if (previous && previous !== definition) {
    console.warn(
      `[dms-base] block type "${definition.type}" is registered again and the previous declaration is replaced`,
    );
  }
  DEFINITIONS.set(definition.type, definition);
  DESCRIPTORS.delete(definition.type);
}

function describe(definition: BlockTypeDefinition): BlockTypeDescriptor {
  const { schema, childMeta, ...rest } = definition;
  const config = describeOptions(schema);
  const descriptor: BlockTypeDescriptor = {
    ...rest,
    config,
    defaults: cloneDefault(collectDefaults(config)),
  };
  if (childMeta) descriptor.childMeta = describeOptions(childMeta);
  return descriptor;
}

/**
 * Descriptors are cached and shared, so they are frozen: a consumer that
 * normalised one in place would otherwise corrupt every later read.
 *
 * Defaults are cloned rather than frozen in place: zod hands back the very
 * object passed to `.default()` on every parse, so freezing it would make that
 * shared instance unwritable for every other consumer of the schema.
 */
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const entry of Object.values(value as Record<string, unknown>)) {
    deepFreeze(entry);
  }
  return Object.freeze(value);
}

function descriptorOf(definition: BlockTypeDefinition): BlockTypeDescriptor {
  const cached = DESCRIPTORS.get(definition.type);
  if (cached) {
    return cached;
  }
  const descriptor = deepFreeze(describe(definition));
  DESCRIPTORS.set(definition.type, descriptor);
  return descriptor;
}

/** Every declared block type, described and JSON-serializable. */
export function ListBlockTypes(): BlockTypeDescriptor[] {
  return Array.from(DEFINITIONS.values()).map(descriptorOf);
}

/** One declared block type, or `undefined` when the type is unknown. */
export function GetBlockType(type: string): BlockTypeDescriptor | undefined {
  const definition = DEFINITIONS.get(type);
  return definition ? descriptorOf(definition) : undefined;
}

/** The raw options schema of a block type, for callers that hold zod. */
export function GetBlockSchema(type: string): ZodTypeAny | undefined {
  return DEFINITIONS.get(type)?.schema;
}

/** RFC 6901: the root is the empty string, and `~` and `/` are escaped. */
function jsonPointer(path: Array<string | number>): string {
  if (path.length === 0) {
    return "";
  }
  const escaped = path.map((segment) =>
    String(segment).replaceAll("~", "~0").replaceAll("/", "~1"),
  );
  return `/${escaped.join("/")}`;
}

/** A validation failure, addressed by a JSON pointer into the options object. */
export interface BlockOptionIssue {
  pointer: string;
  message: string;
}

export interface BlockValidationOk {
  valid: true;
}

export interface BlockValidationFailed {
  valid: false;
  issues: BlockOptionIssue[];
}

export type BlockValidation = BlockValidationOk | BlockValidationFailed;

/**
 * Validate a block's options against its declared schema.
 *
 * A registered type that declares no schema validates: the caller cannot do
 * better than the declaration allows. A type that is not registered at all is
 * refused — the registry knows it is unknown, and answering "valid" to a
 * misspelled block type would send the caller on to write it.
 */
export function ValidateBlockOptions(
  type: string,
  options: unknown,
): BlockValidation {
  if (!DEFINITIONS.has(type)) {
    return {
      valid: false,
      issues: [{ pointer: "", message: `unknown block type "${type}"` }],
    };
  }
  const schema = GetBlockSchema(type);
  if (!schema) {
    return { valid: true };
  }
  const result = schema.safeParse(options ?? {});
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    issues: result.error.issues.map((issue) => ({
      pointer: jsonPointer(issue.path),
      message: issue.message,
    })),
  };
}
