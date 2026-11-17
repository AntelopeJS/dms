/**
 * The `where` clause: what every template accepts to narrow its rows, how it is
 * validated, and how it describes itself to a caller.
 */

import type {
  ConfigValue,
  OptionSchema,
  ResourceFieldStructure,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import { FILTER_OPS } from "./query-chain";
import { checkFilter, checkParamConflicts, issue } from "./query-template";

/** Validates a `where` clause: an optional array of well-typed filters. */
export function checkFilters(
  where: ConfigValue,
  fields: ResourceFieldStructure[],
  pointer = "/where",
): ValidationIssue[] {
  if (where === undefined) {
    return [];
  }
  if (!Array.isArray(where)) {
    return [issue(pointer, "where must be an array of filters")];
  }
  const issues = where.flatMap((filter, index) =>
    checkFilter(filter, fields, `${pointer}/${index}`),
  );
  return issues.length > 0 ? issues : checkParamConflicts(where, fields);
}

/**
 * A filter value is either baked into the chain or bound to a request parameter.
 * The two shapes are spelled out rather than left as a bare `object`, so a caller
 * reading the descriptor learns the `$param` sentinel from the schema instead of
 * from prose that has to be kept in step with it.
 */
function filterValueSchema(): OptionSchema {
  return {
    type: "unknown",
    description:
      "Either a literal matching the field's type (baked into the chain), or a $param binding (supplied per request).",
    oneOf: [
      {
        type: "string",
        description:
          "A literal. Must match the field's type; a date field takes an ISO string.",
      },
      { type: "number", description: "A numeric literal." },
      { type: "boolean", description: "A boolean literal." },
      {
        type: "object",
        description:
          "Binds this filter to a request parameter instead of baking a value in, so one query answers any value the caller passes.",
        properties: {
          $param: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description:
                  "camelCase identifier; becomes the parameter's name (e.g. `min` → `?min=25`).",
              },
              in: {
                type: "string",
                enum: ["query", "param"],
                optional: true,
                description:
                  "Where the route reads the value. Defaults to `query` (`?name=…`). `param` reads a path segment, so the query's endpoint must declare a matching `:name` — the `/stats/…` default has none, so prefer `query` unless the value belongs in the path.",
              },
            },
          },
        },
      },
    ],
  };
}

export function whereSchema(): OptionSchema {
  return {
    type: "array",
    description:
      "Filters combined with AND. Omit for no filtering. Two filters may bind the same $param name if they agree on its type and source.",
    items: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description:
            "A field of the resource — must exist and not be opaque (see GetResourceStructure).",
        },
        op: {
          type: "string",
          enum: [...FILTER_OPS],
          description:
            "Comparison. The ordering ops (gt/ge/lt/le) are rejected on boolean and select fields.",
        },
        value: filterValueSchema(),
      },
    },
  };
}
