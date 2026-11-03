import type { RowActionRule } from "../../types/row-action";
import { FIELD_OPERATORS } from "../../types/row-action-operators";
import { isNull, isObject, isString } from "../../../utils/internal/type-check";

const MAX_ROW_RULE_DEPTH = 64;

interface RuleSite {
  readonly subject: string;
  readonly path: string;
  readonly depth: number;
}

const isRuleObject = (value: unknown): value is object =>
  isObject(value) && !isNull(value) && !Array.isArray(value);

const refusal = (site: RuleSite, problem: string): Error =>
  new Error(`${site.subject}: ${site.path}${problem}`);

const operandSite = (site: RuleSite, key: string): RuleSite => ({
  ...site,
  path: `${site.path}.${key}`,
});

const nestedSite = (site: RuleSite, step: string): RuleSite => ({
  ...site,
  path: `${site.path}${step}`,
  depth: site.depth + 1,
});

function assertRuleList(
  operand: unknown,
  site: RuleSite,
): asserts operand is RowActionRule[] {
  if (!Array.isArray(operand)) {
    throw refusal(site, " must be an array of rules");
  }
  for (const [index, entry] of operand.entries()) {
    assertRuleAt(entry, nestedSite(site, `[${index}]`));
  }
}

function assertRuleAt(
  rule: unknown,
  site: RuleSite,
): asserts rule is RowActionRule {
  if (site.depth > MAX_ROW_RULE_DEPTH) {
    throw refusal(
      site,
      ` nests rules deeper than ${MAX_ROW_RULE_DEPTH} levels`,
    );
  }
  if (!isRuleObject(rule)) throw refusal(site, " must be a rule object");
  if (Object.hasOwn(rule, "and") && "and" in rule) {
    assertRuleList(rule.and, operandSite(site, "and"));
  } else if (Object.hasOwn(rule, "or") && "or" in rule) {
    assertRuleList(rule.or, operandSite(site, "or"));
  } else if (Object.hasOwn(rule, "not") && "not" in rule) {
    assertRuleAt(rule.not, nestedSite(site, ".not"));
  } else {
    const comparison = Object.entries(FIELD_OPERATORS).find(([key]) =>
      Object.hasOwn(rule, key),
    );
    if (!comparison) {
      throw refusal(
        site,
        " must name an operator (and, or, not, equals, notEquals, in or notIn)",
      );
    }
    if (
      !(Object.hasOwn(rule, "field") && "field" in rule && isString(rule.field))
    ) {
      throw refusal(site, ".field must be a string");
    }
    const [operator, { isArray }] = comparison;
    if (
      isArray &&
      !Array.isArray(Object.getOwnPropertyDescriptor(rule, operator)?.value)
    ) {
      throw refusal(site, `.${operator} must be an array`);
    }
  }
}

/**
 * Narrows unchecked input to a {@link RowActionRule} or throws an `Error`
 * reading `<subject>: <path> <problem>`. It checks what the type declares at
 * every nesting level: a rule object that names, as an own key, an operator
 * dispatch can select (a logical operator before a field comparison, the
 * first present of each) with a well-formed operand, and a string `field` for
 * a comparison. A rule nested deeper than 64 levels is refused, a cyclic one
 * included, so the depth of the walk is bounded however the input was built.
 * The number of nodes it visits is not: a rule built in code whose children
 * are shared (a DAG) is walked once per path, so its cost grows with its
 * paths, not with its size in memory. JSON cannot build one.
 *
 * @internal
 */
export function assertRowRule(
  rule: unknown,
  subject: string,
  path = "rule",
): asserts rule is RowActionRule {
  assertRuleAt(rule, { subject, path, depth: 0 });
}
