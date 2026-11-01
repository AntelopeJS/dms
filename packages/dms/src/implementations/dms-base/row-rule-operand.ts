type Scalar = string | number | boolean | null | undefined | Date;

/**
 * What a row rule compares a field with: a scalar or a date, or a list or a
 * plain record of such values. It is a query value no database refuses.
 */
export type RuleOperand =
  | Scalar
  | readonly RuleOperand[]
  | { readonly [field: string]: RuleOperand };

function isScalar(value: unknown): value is Scalar {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  );
}

interface Visit {
  node: unknown;
  leaving?: object;
}

/**
 * Whether a value is a {@link RuleOperand} all the way down. A `bigint`, a
 * `symbol`, a function, a `Map`, a class instance and a cyclic structure are
 * not, since no database records them as given; a value held twice is. It
 * walks with a stack of its own, so a deeply nested value cannot exhaust the
 * call stack.
 */
export function isRuleOperand(value: unknown): value is RuleOperand {
  const ancestors = new Set<object>();
  const pending: Visit[] = [{ node: value }];
  for (let visit = pending.pop(); visit; visit = pending.pop()) {
    if (visit.leaving) {
      ancestors.delete(visit.leaving);
      continue;
    }
    const { node } = visit;
    if (isScalar(node)) {
      continue;
    }
    if (typeof node !== "object" || ancestors.has(node)) {
      return false;
    }
    const prototype: unknown = Object.getPrototypeOf(node);
    if (
      !Array.isArray(node) &&
      prototype !== Object.prototype &&
      prototype !== null
    ) {
      return false;
    }
    ancestors.add(node);
    pending.push({ node: undefined, leaving: node });
    for (const member of Object.values(node)) {
      pending.push({ node: member });
    }
  }
  return true;
}
