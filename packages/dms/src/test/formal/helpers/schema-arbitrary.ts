import type { JsonValue } from "@antelopejs/interface-dms/json";
import fc from "fast-check";
import { z } from "zod";
import { JsonObjectSchema, JsonValueSchema } from "./json";

const MAX_DEPTH = 3;
const CUT_DEPTH = MAX_DEPTH + 2;
const MAX_ITEMS = 2;
const MAX_KEYS = 3;
const ScalarTypeSchema = z.enum([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

function isScalar(node: SchemaNode): boolean {
  return ScalarTypeSchema.safeParse(node.type).success;
}

/**
 * A JSON Schema node, as far as `zod-to-json-schema` writes one for an MCP tool: the keywords the
 * generator reads, and a `$ref` into the same schema.
 */
interface SchemaNode {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, SchemaNode>;
  required?: string[];
  additionalProperties?: boolean | SchemaNode;
  items?: SchemaNode;
  anyOf?: SchemaNode[];
  enum?: JsonValue[];
  const?: JsonValue;
  pattern?: string;
  minLength?: number;
  minItems?: number;
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
}

const SchemaNodeSchema: z.ZodType<SchemaNode> = z.lazy(() =>
  z.object({
    $ref: z.string().optional(),
    type: z.union([z.string(), z.array(z.string())]).optional(),
    properties: z.record(z.string(), SchemaNodeSchema).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.union([z.boolean(), SchemaNodeSchema]).optional(),
    items: SchemaNodeSchema.optional(),
    anyOf: z.array(SchemaNodeSchema).optional(),
    enum: z.array(JsonValueSchema).optional(),
    const: JsonValueSchema.optional(),
    pattern: z.string().optional(),
    minLength: z.number().optional(),
    minItems: z.number().optional(),
    minimum: z.number().optional(),
    exclusiveMinimum: z.number().optional(),
    maximum: z.number().optional(),
  }),
);

/** The strings a generated argument draws from, by the first of these patterns its property name matches. */
export type Grounding = readonly (readonly [RegExp, readonly string[]])[];

/** What the generator is allowed to produce. */
export interface GeneratorOptions {
  /** Values that exist in the project the tools run on, so a generated call reaches the tool's work. */
  grounding: Grounding;
  /** Strings for a property no pattern of `grounding` names. */
  fallback: readonly string[];
  /** Whether a position the schema leaves open may hold `{ $hidden: n }`, as an agent echoes a value it was shown. */
  echoHidden: boolean;
}

function pointerTarget(root: JsonValue, ref: string): SchemaNode {
  const steps = ref
    .replace(/^#\/?/, "")
    .split("/")
    .filter((step) => step !== "")
    .map((step) => step.replaceAll("~1", "/").replaceAll("~0", "~"));
  let node: JsonValue = root;
  for (const step of steps) {
    const next: JsonValue | undefined = Array.isArray(node)
      ? node[Number(step)]
      : JsonObjectSchema.safeParse(node).data?.[step];
    if (next === undefined) throw new Error(`the schema has no ${ref}`);
    node = next;
  }
  return SchemaNodeSchema.parse(node);
}

function isJsonValueNode(node: SchemaNode): boolean {
  const branches = node.anyOf ?? [];
  const scalar = branches.filter(isScalar);
  return (
    scalar.length >= 4 || (node.type === undefined && branches.length === 0)
  );
}

function jsonValue(): fc.Arbitrary<JsonValue> {
  return fc
    .jsonValue({ maxDepth: 2 })
    .map((value) => JsonValueSchema.parse(value));
}

class Generator {
  constructor(
    private readonly root: JsonValue,
    private readonly options: GeneratorOptions,
  ) {}

  /** An arbitrary for the value a property named `key` holds under `node`. */
  build(node: SchemaNode, key: string, depth: number): fc.Arbitrary<JsonValue> {
    if (node.$ref !== undefined) {
      return this.build(pointerTarget(this.root, node.$ref), key, depth);
    }
    if (node.const !== undefined) return fc.constant(node.const);
    if (node.enum !== undefined) return fc.constantFrom(...node.enum);
    if (isJsonValueNode(node)) return this.open(depth);
    if (node.anyOf !== undefined) return this.oneOf(node.anyOf, key, depth);
    const types = Array.isArray(node.type) ? node.type : [node.type];
    return fc.oneof(
      ...types.map((type) => this.ofType(node, type, key, depth)),
    );
  }

  private open(depth: number): fc.Arbitrary<JsonValue> {
    const plain =
      depth >= MAX_DEPTH ? fc.string({ maxLength: 8 }) : jsonValue();
    return this.options.echoHidden
      ? fc.oneof(
          { weight: 1, arbitrary: fc.nat(9).map((n) => ({ $hidden: n + 1 })) },
          { weight: 2, arbitrary: plain },
        )
      : plain;
  }

  private oneOf(
    branches: SchemaNode[],
    key: string,
    depth: number,
  ): fc.Arbitrary<JsonValue> {
    const usable = depth >= MAX_DEPTH ? branches.filter(isScalar) : branches;
    return fc.oneof(
      ...(usable.length > 0 ? usable : branches).map((branch) =>
        this.build(branch, key, depth + 1),
      ),
    );
  }

  private ofType(
    node: SchemaNode,
    type: string | undefined,
    key: string,
    depth: number,
  ): fc.Arbitrary<JsonValue> {
    switch (type) {
      case "string":
        return this.string(node, key);
      case "number":
      case "integer":
        return this.number(node, type === "integer");
      case "boolean":
        return fc.boolean();
      case "null":
        return fc.constant(null);
      case "array":
        return depth >= CUT_DEPTH
          ? fc.constant([])
          : this.array(node, key, depth);
      case "object":
        return depth >= CUT_DEPTH ? fc.constant({}) : this.object(node, depth);
      default:
        return this.open(depth);
    }
  }

  private string(node: SchemaNode, key: string): fc.Arbitrary<JsonValue> {
    const pool =
      this.options.grounding.find(([pattern]) => pattern.test(key))?.[1] ??
      this.options.fallback;
    const matching = pool.filter(
      (value) =>
        value.length >= (node.minLength ?? 0) &&
        (node.pattern === undefined || new RegExp(node.pattern).test(value)),
    );
    const invented =
      node.pattern === undefined
        ? fc.string({ minLength: node.minLength ?? 0, maxLength: 12 })
        : fc.stringMatching(new RegExp(node.pattern));
    return matching.length === 0
      ? invented
      : fc.oneof(
          { weight: 3, arbitrary: fc.constantFrom(...matching) },
          { weight: 1, arbitrary: invented },
        );
  }

  private number(node: SchemaNode, integer: boolean): fc.Arbitrary<JsonValue> {
    const min = node.minimum ?? (node.exclusiveMinimum ?? -1) + 1;
    const max = node.maximum ?? Math.max(min, 0) + 20;
    return fc
      .integer({ min: Math.max(min, 0), max: Math.max(max, 0) })
      .map((n) => (integer ? n : n / 2));
  }

  private array(
    node: SchemaNode,
    key: string,
    depth: number,
  ): fc.Arbitrary<JsonValue> {
    const items = node.items ?? {};
    return fc.array(this.build(items, key, depth + 1), {
      minLength: node.minItems ?? 0,
      maxLength: Math.max(node.minItems ?? 0, MAX_ITEMS),
    });
  }

  private object(node: SchemaNode, depth: number): fc.Arbitrary<JsonValue> {
    const properties = Object.entries(node.properties ?? {});
    const extra = node.additionalProperties;
    if (properties.length === 0 && extra !== undefined && extra !== false) {
      const values =
        extra === true ? this.open(depth) : this.build(extra, "", depth + 1);
      return fc.dictionary(
        fc.constantFrom("label", "title", "caption", "kind", "value", "tabs"),
        values,
        { maxKeys: MAX_KEYS },
      );
    }
    const model = Object.fromEntries(
      properties.map(([name, child]) => [
        name,
        this.build(child, name, depth + 1),
      ]),
    );
    return fc
      .record(model, { requiredKeys: node.required ?? [] })
      .map((value) => JsonObjectSchema.parse(value));
  }
}

/**
 * An arbitrary for the arguments of a tool, drawn from its JSON Schema: every required property,
 * each optional one when the draw has it, strings from the project's own values or invented, and
 * a free-form position holding any JSON value.
 *
 * @param schema The tool's `inputSchema`
 * @param options What the generator may produce
 */
export function argumentsOf(
  schema: Record<string, JsonValue>,
  options: GeneratorOptions,
): fc.Arbitrary<JsonValue> {
  const root = JsonValueSchema.parse(schema);
  return new Generator(root, options).build(
    SchemaNodeSchema.parse(root),
    "",
    0,
  );
}
