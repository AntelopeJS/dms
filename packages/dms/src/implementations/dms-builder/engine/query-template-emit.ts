/**
 * The templates the engine provides: what each accepts as parameters, what it
 * computes, and how it is read back from emitted code.
 *
 * The text of the chain is rendered by query-plan.ts: a template describes a
 * plan, it does not write code.
 */

import { stringLiteralValue } from "./literals";
import { seriesTemplate } from "./query-template-series";
import { checkFilters, whereSchema } from "./query-where";
import { planFilters } from "./query-plan";
import { readChain, whereParams } from "./query-chain";
import { describeValue } from "./describe-value";
import { isOneOf } from "./scalar-guards";
import {
  AGGREGATE_OPS,
  aggregateMeasure,
  checkField,
  issue,
  QueryTemplate,
  registerQueryTemplate,
  scanForExpr,
} from "./query-template";
function countTemplate(): QueryTemplate {
  return {
    descriptor: {
      id: "count",
      resourceType: "database-table",
      title: "Count",
      description: "Counts the rows matching an optional filter.",
      output: "scalar",
      params: { where: { ...whereSchema(), optional: true } },
    },
    validate: (params, fields) => [
      ...scanForExpr(params, "query params"),
      ...checkFilters(params.where, fields),
    ],
    plan: (params) => ({
      filters: planFilters(params.where),
      measure: { kind: "count" },
    }),
    parse: (method) => {
      const chain = readChain(method);
      if (
        !chain ||
        chain.terminalName !== "count" ||
        chain.terminalArgs.length !== 0
      ) {
        return undefined;
      }
      return whereParams(chain.filters);
    },
  };
}

function aggregateTemplate(): QueryTemplate {
  return {
    descriptor: {
      id: "aggregate",
      resourceType: "database-table",
      title: "Aggregate",
      description:
        "Sums, averages, or takes the min/max of a numeric field over the rows matching an optional filter.",
      output: "scalar",
      params: {
        op: {
          type: "string",
          enum: [...AGGREGATE_OPS],
          description: "Which aggregate to take over the matching rows.",
        },
        field: {
          type: "string",
          description:
            "The numeric field to aggregate. A non-numeric field is rejected.",
        },
        where: { ...whereSchema(), optional: true },
      },
    },
    validate: (params, fields) => {
      const issues = [
        ...scanForExpr(params, "query params"),
        ...checkFilters(params.where, fields),
      ];
      if (!isOneOf(AGGREGATE_OPS, params.op)) {
        issues.push(
          issue("/op", `op must be one of ${[...AGGREGATE_OPS].join(", ")}`),
        );
      }
      const resolved = checkField(fields, params.field, "/field");
      if ("pointer" in resolved) {
        issues.push(resolved);
      } else if (resolved.ts !== "number") {
        issues.push(
          issue(
            "/field",
            `field ${describeValue(params.field)} is not numeric; aggregate needs a number field`,
          ),
        );
      }
      return issues;
    },
    plan: (params) => ({
      filters: planFilters(params.where),
      measure: aggregateMeasure(params),
    }),
    parse: (method) => {
      const chain = readChain(method);
      if (
        !chain ||
        !isOneOf(AGGREGATE_OPS, chain.terminalName) ||
        chain.terminalArgs.length !== 1
      ) {
        return undefined;
      }
      const field = stringLiteralValue(chain.terminalArgs[0]);
      if (field === undefined) {
        return undefined;
      }
      return { op: chain.terminalName, field, ...whereParams(chain.filters) };
    },
  };
}

/**
 * Fill the template registry with the templates the engine ships.
 *
 * Called explicitly by the implementation's entry point rather than run as an
 * import side effect: nothing else imports this module for a value, so a bare
 * side-effecting import reads as dead to a linter and was already dropped once —
 * leaving the registry empty, every `AddQuery` failing on an unknown template and
 * every written query reading back as opaque.
 */
export function registerBuiltinQueryTemplates(): void {
  registerQueryTemplate(countTemplate());
  registerQueryTemplate(aggregateTemplate());
  registerQueryTemplate(seriesTemplate());
}
