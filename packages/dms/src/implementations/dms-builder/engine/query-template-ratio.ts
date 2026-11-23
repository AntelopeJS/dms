/**
 * The `ratio` template: one scalar calculation over another, answered as a
 * percentage. What a KpiCard with `valueFormat: "percent"` reads: 25 shows 25 %.
 *
 * @packageDocumentation
 */

import type {
  ConfigObject,
  ConfigValue,
  OptionSchema,
  ResourceFieldStructure,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import { describeValue } from "./describe-value";
import { stringLiteralValue } from "./literals";
import { isPlainObject } from "./plain-object";
import {
  parameterNames,
  type RawChain,
  readChainFrom,
  returnedCall,
  whereParams,
} from "./query-chain";
import { planFilters, PERCENT_HELPER, type ScalarPlan } from "./query-plan";
import {
  aggregateMeasure,
  checkField,
  issue,
  type ParamBindings,
  type ParsedParams,
  type QueryTemplate,
  scanForExpr,
  unvalidatedParam,
} from "./query-template";
import { checkFilters, whereSchema } from "./query-where";
import { Node } from "ts-morph";

const SIDES = ["numerator", "denominator"] as const;
const SIDE_OPS = ["count", "sum"] as const;
const SIDE_KEYS = ["op", "field", "where"];

function sideSchema(description: string): OptionSchema {
  return {
    type: "object",
    description,
    properties: {
      op: {
        type: "string",
        enum: [...SIDE_OPS],
        optional: true,
        description:
          "What to measure over this side's rows: count them, or sum a numeric field. Defaults to count.",
      },
      field: {
        type: "string",
        optional: true,
        description:
          "The numeric field to sum. Only with op sum; a count takes none.",
      },
      where: { ...whereSchema(), optional: true },
    },
  };
}

function checkMeasure(
  side: ConfigObject,
  fields: ResourceFieldStructure[],
  pointer: string,
): ValidationIssue[] {
  if (side.op === undefined || side.op === "count") {
    return side.field === undefined
      ? []
      : [
          issue(
            `${pointer}/field`,
            "field is only read by sum; a count takes none",
          ),
        ];
  }
  if (side.op !== "sum") {
    return [issue(`${pointer}/op`, `op must be one of ${SIDE_OPS.join(", ")}`)];
  }
  const resolved = checkField(fields, side.field, `${pointer}/field`);
  if ("pointer" in resolved) {
    return [resolved];
  }
  return resolved.ts === "number"
    ? []
    : [
        issue(
          `${pointer}/field`,
          `field ${describeValue(side.field)} is not numeric; sum needs a number field`,
        ),
      ];
}

function checkSide(
  side: ConfigValue | undefined,
  pointer: string,
  fields: ResourceFieldStructure[],
  bindings: ParamBindings,
): ValidationIssue[] {
  if (!isPlainObject(side)) {
    return [issue(pointer, "must be an object with op, field and where")];
  }
  return [
    ...Object.keys(side)
      .filter((key) => !SIDE_KEYS.includes(key))
      .map((key) =>
        issue(
          `${pointer}/${key}`,
          `a ratio side declares no parameter "${key}"`,
        ),
      ),
    ...checkFilters(side.where, fields, `${pointer}/where`, bindings),
    ...checkMeasure(side, fields, pointer),
  ];
}

function sidePlan(name: string, side: ConfigValue | undefined): ScalarPlan {
  if (!isPlainObject(side)) {
    throw unvalidatedParam(name);
  }
  return {
    filters: planFilters(side.where),
    measure: side.op === "sum" ? aggregateMeasure(side) : { kind: "count" },
  };
}

/** A side's parameters from the chain written for it, as the plan reads them back. */
function sideParams(chain: RawChain): ConfigObject | undefined {
  if (chain.terminalName === "count" && chain.terminalArgs.length === 0) {
    return { ...whereParams(chain.filters) };
  }
  if (chain.terminalName !== "sum" || chain.terminalArgs.length !== 1) {
    return undefined;
  }
  const field = stringLiteralValue(chain.terminalArgs[0]);
  return field === undefined
    ? undefined
    : { op: "sum", field, ...whereParams(chain.filters) };
}

export function ratioTemplate(): QueryTemplate {
  return {
    descriptor: {
      id: "ratio",
      resourceType: "database-table",
      title: "Ratio",
      description:
        "Answers numerator / denominator as a percentage, where 25 means 25 %, and leaves the value out when the denominator is 0. Each side counts the rows of this resource matching its own filters, or sums a numeric field over them. Serve it to a KpiCard with valueFormat percent, which shows 25 as 25 %, e.g. bikes rented over all bikes.",
      output: "scalar",
      params: {
        numerator: sideSchema("The figure above the line."),
        denominator: sideSchema(
          "The figure below the line. An empty object counts every row.",
        ),
      },
    },
    nullable: true,
    validate: (params, fields) => {
      const bindings: ParamBindings = new Map();
      return [
        ...scanForExpr(params, "query params"),
        ...SIDES.flatMap((side) =>
          checkSide(params[side], `/${side}`, fields, bindings),
        ),
      ];
    },
    plan: (params) => ({
      kind: "ratio",
      numerator: sidePlan("numerator", params.numerator),
      denominator: sidePlan("denominator", params.denominator),
    }),
    parse: (method) => {
      const call = returnedCall(method);
      const callee = call?.getExpression();
      if (
        !call ||
        !Node.isIdentifier(callee) ||
        callee.getText() !== PERCENT_HELPER
      ) {
        return undefined;
      }
      const sides = call.getArguments();
      if (sides.length !== SIDES.length) {
        return undefined;
      }
      const names = parameterNames(method);
      const [numerator, denominator] = sides.map((argument) => {
        const chain = readChainFrom(argument, names);
        return chain ? sideParams(chain) : undefined;
      });
      if (!numerator || !denominator) {
        return undefined;
      }
      const params: ParsedParams = { numerator, denominator };
      return params;
    },
  };
}
