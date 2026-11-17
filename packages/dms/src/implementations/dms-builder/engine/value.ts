import type {
  ConfigObject,
  ConfigValue,
  ImportRef,
} from "@antelopejs/interface-dms-builder";
import { buildCatalog } from "./catalog";
import { isLiteralObject } from "./guards";
import { propertyKey } from "./paths";

interface RefResolution {
  text: string;
  import: ImportRef;
}

export interface EmitContext {
  addImport(ref: ImportRef): void;
  /** Resolves a `$ref` to a class identifier + its import. Absent outside a resource-aware op. */
  resolveRef?(ref: RefSentinel["$ref"]): RefResolution;
}

/** An author's value that cannot be serialized: the operation refuses it as `invalid_config`. */
export class InvalidValueError extends Error {}

export class UnknownDataTypeError extends InvalidValueError {
  constructor(public readonly id: string) {
    super(`unknown dataType "${id}"`);
  }
}

export class UnknownReferenceError extends InvalidValueError {
  constructor(public readonly resource: string) {
    super(`unknown resource reference "${resource}"`);
  }
}

class UnknownBlockTypeError extends InvalidValueError {
  constructor(public readonly type: string) {
    super(`unknown block type "${type}"`);
  }
}

/** An emit context together with the imports it has collected. */
export interface ImportCollector {
  ctx: EmitContext;
  imports: ImportRef[];
}

type ExprSentinel = {
  $expr: string;
};

type DataTypeSentinel = ConfigObject & { $dataType: string };

type BlockSentinel = {
  $block: ConfigObject & { type: string };
};

type RefSentinel = {
  $ref: ConfigObject & { resource: string };
};

export function createImportCollector(opts?: {
  resolveRef?: EmitContext["resolveRef"];
}): ImportCollector {
  const imports: ImportRef[] = [];
  return {
    ctx: {
      addImport: (ref) => imports.push(ref),
      resolveRef: opts?.resolveRef,
    },
    imports,
  };
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExprSentinel(value: ConfigObject): value is ExprSentinel {
  return (
    "$expr" in value &&
    typeof value.$expr === "string" &&
    Object.keys(value).length === 1
  );
}

function isDataTypeSentinel(value: ConfigObject): value is DataTypeSentinel {
  if (!("$dataType" in value) || typeof value.$dataType !== "string") {
    return false;
  }
  return Object.keys(value).every(
    (key) => key === "$dataType" || key === "config",
  );
}

function isBlockSentinel(value: ConfigObject): value is BlockSentinel {
  if (
    !("$block" in value) ||
    !isLiteralObject(value.$block) ||
    Object.keys(value).length !== 1
  ) {
    return false;
  }
  return typeof value.$block.type === "string";
}

/**
 * Emits a nested block as its factory call — the shape a `x-component` option
 * takes, such as a ChartCard's `chart`.
 */
function blockText(value: BlockSentinel, ctx: EmitContext): string {
  const block = value.$block;
  const descriptor = buildCatalog().blocks.find(
    (candidate) => candidate.type === block.type,
  );
  if (!descriptor) {
    throw new UnknownBlockTypeError(block.type);
  }
  ctx.addImport(descriptor.import);
  const config = isLiteralObject(block.config) ? block.config : undefined;
  const arg =
    config && definedEntries(config).length > 0
      ? objectValueText(config, ctx)
      : "";
  return `${descriptor.type}(${arg})`;
}

function isRefSentinel(value: ConfigObject): value is RefSentinel {
  if (
    !("$ref" in value) ||
    !isLiteralObject(value.$ref) ||
    Object.keys(value).length !== 1
  ) {
    return false;
  }
  return typeof value.$ref.resource === "string";
}

function refText(value: RefSentinel, ctx: EmitContext): string {
  const ref = value.$ref;
  if (!ctx.resolveRef) {
    throw new UnknownReferenceError(ref.resource);
  }
  const resolved = ctx.resolveRef(ref);
  ctx.addImport(resolved.import);
  return resolved.text;
}

function definedEntries(obj: ConfigObject): [string, ConfigValue][] {
  return Object.entries(obj).filter(([, value]) => value !== undefined);
}

function dataTypeText(value: DataTypeSentinel, ctx: EmitContext): string {
  const id = value.$dataType;
  const descriptor = buildCatalog().dataTypes.find((type) => type.id === id);
  if (!descriptor) {
    throw new UnknownDataTypeError(id);
  }
  ctx.addImport(descriptor.import);
  const config = isLiteralObject(value.config) ? value.config : undefined;
  const arg =
    config && definedEntries(config).length > 0
      ? objectValueText(config, ctx)
      : "";
  return `new ${descriptor.import.name}(${arg})`;
}

/**
 * Past this, an object or array is written one entry per line.
 *
 * `formatText()` runs over what the builder writes, but it only re-indents —
 * it never breaks a long line. So a config that would run off the screen has
 * to arrive already broken, or saving a page collapses a block its author had
 * written across ten readable lines onto one.
 */
const INLINE_VALUE_LIMIT = 72;

/**
 * The entries of an object or array, on one line when they fit and one per line
 * when they do not. A part that already spans lines forces the break, so a
 * nested object never leaves its siblings stranded on the opening line.
 */
export function inlineOrBlock(
  parts: string[],
  open: string,
  close: string,
): string {
  const inline =
    open === "{" ? `{ ${parts.join(", ")} }` : `[${parts.join(", ")}]`;
  if (inline.length <= INLINE_VALUE_LIMIT && !inline.includes("\n")) {
    return inline;
  }
  return `${open}\n${parts.map((part) => `${part},`).join("\n")}\n${close}`;
}

function objectValueText(obj: ConfigObject, ctx: EmitContext): string {
  const entries = definedEntries(obj);
  if (entries.length === 0) {
    return "{}";
  }
  const parts = entries.map(
    ([key, value]) => `${propertyKey(key)}: ${serializeValue(value, ctx)}`,
  );
  return inlineOrBlock(parts, "{", "}");
}

export function serializeValue(value: ConfigValue, ctx: EmitContext): string {
  if (isLiteralObject(value)) {
    if (isExprSentinel(value)) {
      return value.$expr;
    }
    if (isDataTypeSentinel(value)) {
      return dataTypeText(value, ctx);
    }
    if (isRefSentinel(value)) {
      return refText(value, ctx);
    }
    if (isBlockSentinel(value)) {
      return blockText(value, ctx);
    }
    return objectValueText(value, ctx);
  }
  if (Array.isArray(value)) {
    return inlineOrBlock(
      value.map((item) => serializeValue(item, ctx)),
      "[",
      "]",
    );
  }
  return JSON.stringify(value);
}
