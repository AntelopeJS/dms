import type {
  AddQueryInput,
  ConfigValue,
  FilterOp,
  ImportRef,
  OpWarning,
  QueryParamBinding,
  QueryTemplateDescriptor,
  ResourceFieldStructure,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import type { MethodDeclaration } from "ts-morph";
import type { PlanMeasure, QueryPlan } from "./query-plan";
import { isIdentifier } from "./paths";
import { FILTER_OPS, filterOpNamed, type ParsedWhere } from "./query-chain";
import { describeValue } from "./describe-value";
import { dbTypeFor } from "./resource-emit-types";
import {
  isBoolean,
  isNumber,
  isScalar,
  isString,
  type Scalar,
} from "./scalar-guards";
import { isPlainObject } from "./value";

/** The parameters a query template is given, as `AddQueryInput` carries them. */
export type QueryParams = NonNullable<AddQueryInput["params"]>;

/** A template's parameters as read back from a model method, with `where` typed. */
export type ParsedParams = QueryParams & ParsedWhere;

/** A parameter the compiled chain needs, supplied by the route. */
export interface MethodParam {
  /** The model method's parameter name — template-derived, e.g. `minPrice`. */
  name: string;
  /** The public name the route exposes it under, from the binding's `$param`. */
  routeName: string;
  /** The TS type on the model method, from the filtered field. */
  type: string;
  /** Where the route reads it from. */
  in: "query" | "param";
}

export interface CompiledChain {
  /** The model method body, braces included. */
  body: string;
  parameters: MethodParam[];
  imports?: ImportRef[];
  warnings?: OpWarning[];
}

export interface QueryTemplate {
  descriptor: QueryTemplateDescriptor;
  validate(
    params: QueryParams,
    fields: ResourceFieldStructure[],
  ): ValidationIssue[];
  /**
   * The calculation these parameters describe. Every backend reads this one
   * description — the emitter that writes it into a model, the executor that
   * runs it for a preview, and nothing else may render a chain of its own.
   */
  plan(params: QueryParams, fields: ResourceFieldStructure[]): QueryPlan;
  /**
   * The inverse of {@link plan}: reads a model method back into the params
   * that would produce it, or returns `undefined` when the body is not a chain
   * this template shaped. Bound filter values come back as a `$bind` sentinel
   * naming the model parameter; read-back resolves those against the route.
   */
  parse(method: MethodDeclaration): ParsedParams | undefined;
}

const templates = new Map<string, QueryTemplate>();

export function registerQueryTemplate(template: QueryTemplate): void {
  templates.set(template.descriptor.id, template);
}

export function getQueryTemplate(id: string): QueryTemplate | undefined {
  return templates.get(id);
}

/**
 * Every issue with a template's params: a key the template does not declare,
 * then what its own `validate` refuses. `AddQuery` and `PreviewQuery` both read
 * this, so a preview refuses exactly what a write would.
 */
export function templateParamIssues(
  template: QueryTemplate,
  params: QueryParams,
  fields: ResourceFieldStructure[],
): ValidationIssue[] {
  const known = new Set(Object.keys(template.descriptor.params));
  return [
    ...Object.keys(params)
      .filter((key) => !known.has(key))
      .map((key) => ({
        pointer: `/${key}`,
        message: `template "${template.descriptor.id}" declares no parameter "${key}"`,
      })),
    ...template.validate(params, fields),
  ];
}

/**
 * Reads a model method as a query, by asking every template to `parse` it and
 * accepting the answer only when exactly one does. The single-match rule is the
 * guard against templates whose emitted shapes ever overlap: an ambiguous body
 * reads back as no query at all rather than as the wrong one.
 */
export function parseModelMethod(
  method: MethodDeclaration,
): { template: string; params: ParsedParams } | undefined {
  const hits: { template: string; params: ParsedParams }[] = [];
  for (const template of templates.values()) {
    const params = template.parse(method);
    if (params) {
      hits.push({ template: template.descriptor.id, params });
    }
  }
  return hits.length === 1 ? hits[0] : undefined;
}

/**
 * A live read of the registry rather than a memoized snapshot, so templates
 * contributed by other modules can come and go with module loads.
 */
export function listQueryTemplates(
  resourceType?: string,
): QueryTemplateDescriptor[] {
  return Array.from(templates.values())
    .map((template) => template.descriptor)
    .filter(
      (descriptor) =>
        resourceType === undefined || descriptor.resourceType === resourceType,
    );
}

const ORDERING_OPS = new Set<FilterOp>(["gt", "ge", "lt", "le"]);
export const AGGREGATE_OPS = ["sum", "avg", "min", "max"] as const;
const UNORDERED_DATA_TYPES = new Set(["select", "boolean"]);

export function issue(pointer: string, message: string): ValidationIssue {
  return { pointer, message };
}

/** What a plan reports when it is asked for a parameter `validate` never passed. */
export function unvalidatedParam(name: string): Error {
  return new Error(
    `query parameter "${name}" was planned before it was validated`,
  );
}

/** The aggregate a validated `op` and `field` describe. */
export function aggregateMeasure(params: {
  op?: unknown;
  field?: unknown;
}): Extract<PlanMeasure, { kind: "aggregate" }> {
  const { op, field } = params;
  if (!isString(op)) {
    throw unvalidatedParam("op");
  }
  if (!isString(field)) {
    throw unvalidatedParam("field");
  }
  return { kind: "aggregate", op, field };
}

export function isParamBinding(value: unknown): value is QueryParamBinding {
  return (
    isPlainObject(value) &&
    isPlainObject(value.$param) &&
    typeof value.$param.name === "string"
  );
}

/**
 * Refuses `$expr` anywhere in a value. Query params and page drafts are data; a
 * raw expression would put uncheckable code inside a model body or a page.
 */
export function scanForExpr(
  value: ConfigValue,
  within: string,
  pointer = "",
): ValidationIssue[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      scanForExpr(item, within, `${pointer}/${index}`),
    );
  }
  if (!isPlainObject(value)) {
    return [];
  }
  if (isString(value.$expr)) {
    return [issue(pointer, `$expr is not allowed in ${within}`)];
  }
  return Object.entries(value).flatMap(([key, entry]) =>
    scanForExpr(entry, within, `${pointer}/${key}`),
  );
}

function findField(
  fields: ResourceFieldStructure[],
  name: string,
): ResourceFieldStructure | undefined {
  return fields.find((field) => field.name === name);
}

interface FieldTypes {
  ts: string;
  dataType: string;
  /**
   * The DataType is not one the builder maps, so `ts` is the `string` default
   * rather than a known type. The chain still compiles — a generated resource
   * stores such a field as a string — but a hand-written table may not.
   */
  fallback: boolean;
}

function fieldTypes(field: ResourceFieldStructure): FieldTypes | undefined {
  const dataType = field.dataType;
  if (!dataType?.$dataType) {
    return undefined;
  }
  const dbType = dbTypeFor(dataType);
  return {
    ts: dbType.ts,
    dataType: dataType.$dataType,
    fallback: dbType.fallback,
  };
}

export function fallbackTypeWarning(
  field: string,
  types: FieldTypes,
): OpWarning[] {
  if (!types.fallback) {
    return [];
  }
  return [
    {
      code: "datatype_fallback",
      message: `field "${field}" uses DataType "${types.dataType}", which the builder does not map; the filter compares it as a string`,
    },
  ];
}

/**
 * Resolves a field to its TS type, refusing anything the chain could not filter
 * on: an unknown name, or a field whose decorator stack did not reverse.
 */
export function checkField(
  fields: ResourceFieldStructure[],
  name: ConfigValue,
  pointer: string,
): FieldTypes | ValidationIssue {
  if (!isString(name) || name.length === 0) {
    return issue(pointer, "field must be a non-empty string");
  }
  const field = findField(fields, name);
  if (!field) {
    return issue(pointer, `unknown field "${name}" on this resource`);
  }
  if (field.opaque) {
    return issue(pointer, `field "${name}" is opaque and cannot be queried`);
  }
  const types = fieldTypes(field);
  return types ?? issue(pointer, `field "${name}" has no resolvable DataType`);
}

function literalMatchesType(value: Scalar, ts: string): boolean {
  if (ts === "number") return isNumber(value);
  if (ts === "boolean") return isBoolean(value);
  if (ts === "Date") return isString(value) || isNumber(value);
  return isString(value);
}

const PARAM_SOURCES = new Set(["query", "param"]);

/**
 * A route parameter's name reaches the emitted source as a bare identifier, so
 * anything that is not one would be spliced into `database.ts` and `page.ts` as
 * code rather than as a name.
 */
function checkParamBinding(
  value: QueryParamBinding,
  pointer: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isIdentifier(value.$param.name)) {
    issues.push(
      issue(
        `${pointer}/name`,
        `${describeValue(value.$param.name)} is not a valid parameter name; expected a camelCase identifier`,
      ),
    );
  }
  const source = value.$param.in;
  if (source !== undefined && !PARAM_SOURCES.has(source)) {
    issues.push(
      issue(
        `${pointer}/in`,
        `in must be one of ${[...PARAM_SOURCES].join(", ")}`,
      ),
    );
  }
  return issues;
}

/**
 * Two filters may bind the same route parameter, but only on the same type and
 * source: they compile down to one method parameter, and a conflict there would
 * emit that parameter twice.
 */
interface ParamBindingInfo {
  name: string;
  type: string;
  in: "query" | "param";
}

export function checkParamConflicts(
  where: ConfigValue[],
  fields: ResourceFieldStructure[],
): ValidationIssue[] {
  const seen = new Map<string, ParamBindingInfo>();
  const issues: ValidationIssue[] = [];
  where.forEach((raw, index) => {
    if (!isPlainObject(raw) || !isParamBinding(raw.value)) {
      return;
    }
    const resolved = checkField(fields, raw.field, "");
    const param: ParamBindingInfo = {
      name: raw.value.$param.name,
      type: "ts" in resolved ? resolved.ts : "string",
      in: raw.value.$param.in ?? "query",
    };
    const previous = seen.get(param.name);
    if (!previous) {
      seen.set(param.name, param);
      return;
    }
    if (previous.type !== param.type || previous.in !== param.in) {
      issues.push(
        issue(
          `/where/${index}/value/$param`,
          `parameter "${param.name}" is already bound as ${previous.in} ${previous.type}; a name may only bind one type and source`,
        ),
      );
    }
  });
  return issues;
}

export function checkFilter(
  filter: ConfigValue,
  fields: ResourceFieldStructure[],
  pointer: string,
): ValidationIssue[] {
  if (!isPlainObject(filter)) {
    return [issue(pointer, "filter must be an object")];
  }
  const resolved = checkField(fields, filter.field, `${pointer}/field`);
  if ("pointer" in resolved) {
    return [resolved];
  }
  const op = filter.op;
  const operator = isString(op) ? filterOpNamed(op) : undefined;
  if (operator === undefined) {
    return [
      issue(`${pointer}/op`, `op must be one of ${[...FILTER_OPS].join(", ")}`),
    ];
  }
  if (
    ORDERING_OPS.has(operator) &&
    UNORDERED_DATA_TYPES.has(resolved.dataType)
  ) {
    return [
      issue(
        `${pointer}/op`,
        `op "${operator}" is not valid on a ${resolved.dataType} field`,
      ),
    ];
  }
  if (isParamBinding(filter.value)) {
    return checkParamBinding(filter.value, `${pointer}/value/$param`);
  }
  if (
    !isScalar(filter.value) ||
    !literalMatchesType(filter.value, resolved.ts)
  ) {
    return [
      issue(
        `${pointer}/value`,
        `value does not match field type ${resolved.ts}`,
      ),
    ];
  }
  return [];
}
