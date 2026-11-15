import antiSlop from "@antelopejs/tooling-configs/oxc/anti-slop";
import guardrails from "@antelopejs/tooling-configs/oxc/guardrails";

/** @typedef {(typeof guardrails)["rules"][string]} OxlintRule */
/** @typedef {Extract<OxlintRule, { createOnce: unknown }>} CreateOnceRule */
/** @typedef {Parameters<CreateOnceRule["createOnce"]>[0]} OxlintContext */
/** @typedef {OxlintContext["sourceCode"]} OxlintSourceCode */
/** @typedef {Parameters<OxlintSourceCode["isGlobalReference"]>[0]} OxlintNode */
/** @typedef {Extract<OxlintNode, { name: string }>} OxlintIdentifier */
/** @typedef {ReturnType<OxlintSourceCode["getScope"]>} OxlintScope */

/** @typedef {{ type: string, range: [number, number], start?: number, end?: number } & Record<string, unknown>} EslintNode */

const rules = {
  "no-fs-read-in-tests": guardrails.rules["no-fs-read-in-tests"],
  "require-assertion": guardrails.rules["require-assertion"],
  "no-constant-value-assertion":
    guardrails.rules["no-constant-value-assertion"],
  "no-typeof-function-only-test":
    guardrails.rules["no-typeof-function-only-test"],
  "no-module-mocking": antiSlop.rules["no-module-mocking"],
};

/**
 * @param {OxlintRule} rule
 * @returns {CreateOnceRule}
 */
function requireCreateOnce(rule) {
  if (!("createOnce" in rule))
    throw new Error("The rule defines no createOnce");
  return rule;
}

/**
 * @param {unknown} value
 * @returns {value is OxlintContext}
 */
function isOxlintContext(value) {
  return (
    value instanceof Object &&
    "id" in value &&
    "options" in value &&
    "report" in value &&
    "sourceCode" in value
  );
}

/**
 * @param {unknown} value
 * @returns {value is EslintNode}
 */
function isEslintNode(value) {
  return (
    value instanceof Object &&
    Object.hasOwn(value, "type") &&
    Object.hasOwn(value, "range") &&
    "range" in value &&
    Array.isArray(value.range)
  );
}

/**
 * @param {unknown} root
 * @param {OxlintSourceCode["visitorKeys"]} visitorKeys
 */
function addOffsets(root, visitorKeys) {
  /** @type {EslintNode[]} */
  const pending = isEslintNode(root) ? [root] : [];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || current.start !== undefined) continue;
    [current.start, current.end] = current.range;
    for (const key of visitorKeys[current.type] ?? []) {
      const children = current[key];
      for (const child of Array.isArray(children) ? children : [children])
        if (isEslintNode(child)) pending.push(child);
    }
  }
}

export default {
  rules: Object.fromEntries(
    Object.entries(rules).map(([name, rule]) => [
      name,
      {
        meta: rule.meta,
        /** @param {OxlintContext} context */
        create(context) {
          const sourceCode = context.sourceCode;
          /** @type {unknown} */
          const compatibleSourceCode = Object.create(sourceCode, {
            isGlobalReference: {
              /** @param {OxlintIdentifier} node */
              value(node) {
                /** @type {OxlintScope | null} */
                let scope = sourceCode.getScope(node);
                while (scope !== null) {
                  const variable = scope.set.get(node.name);
                  if (variable !== undefined) return variable.defs.length === 0;
                  scope = scope.upper;
                }
                return true;
              },
            },
          });
          /** @type {unknown} */
          const compatibleContext = Object.create(context, {
            sourceCode: { value: compatibleSourceCode },
          });
          if (!isOxlintContext(compatibleContext))
            throw new Error("The compatible context lacks the rule context");
          const visitors =
            requireCreateOnce(rule).createOnce(compatibleContext);
          return {
            ...visitors,
            /** @param {Extract<OxlintNode, { type: "Program" }>} node */
            Program(node) {
              addOffsets(node, sourceCode.visitorKeys);
              visitors.Program?.(node);
            },
          };
        },
      },
    ]),
  ),
};
