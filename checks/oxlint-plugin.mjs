/**
 * @typedef {{ selector: string, message: string }} Restriction
 * @typedef {{
 *   options: Restriction[],
 *   report(descriptor: { node: unknown, message: string }): void,
 * }} RuleContext
 */

/**
 * ESLint's `no-restricted-syntax`, which oxlint does not ship: each option is
 * an esquery selector and the message reported on every node it matches.
 */
const noRestrictedSyntax = {
  meta: {
    type: "problem",
    schema: {
      type: "array",
      items: {
        type: "object",
        properties: {
          selector: { type: "string" },
          message: { type: "string" },
        },
        required: ["selector", "message"],
        additionalProperties: false,
      },
    },
  },
  /** @param {RuleContext} context */
  create(context) {
    return Object.fromEntries(
      context.options.map(({ selector, message }) => [
        selector,
        /** @param {unknown} node */
        (node) => context.report({ node, message }),
      ]),
    );
  },
};

export default {
  meta: { name: "dms" },
  rules: { "no-restricted-syntax": noRestrictedSyntax },
};
