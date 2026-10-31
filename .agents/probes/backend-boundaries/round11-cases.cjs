const { existsSync } = require("node:fs");
const { baselineRules, join } = require("./context.cjs");

/**
 * @typedef {{
 *   name: string;
 *   from: string;
 *   target: string;
 *   request?: string;
 *   binding?: string;
 *   escape?: boolean;
 *   runtime?: boolean;
 *   allowed?: boolean;
 *   rule?: string;
 * }} Round11Case
 */

/**
 * @param {string} sourceRoot
 * @returns {Round11Case[]}
 */
function round11Cases(sourceRoot) {
  return [
    {
      name: "db-root-getConfig",
      from: "db",
      target: "index.ts",
      request: "..",
      binding: "getConfig",
      escape: true,
      runtime: true,
    },
    ...["index", "startup-config", "client-origin-cors", "frontend-module"].map(
      (name) => ({
        name: `utils-root-${name}`,
        from: "utils",
        target: `${name}.ts`,
        escape: true,
      }),
    ),
    ...["db", "utils"].flatMap((from) => [
      ...[
        "dev/module-update-notifications",
        "page-extensions/pending-report",
      ].map((name) => ({
        name: `${from}-private-${name}`,
        from,
        target: `${name}.ts`,
        escape: true,
        runtime: true,
      })),
      ...["dev", "page-extensions"].map((name) => ({
        name: `${from}-rank-${name}`,
        from,
        target: `${name}/index.ts`,
        escape: true,
      })),
      {
        name: `${from}-config-public`,
        from,
        target: "config/index.ts",
        allowed: true,
        binding: "getConfig",
        runtime: true,
      },
    ]),
    ...["dev", "page-extensions", "routes"].map((name) => ({
      name: `root-composition-${name}`,
      from: "",
      target: `${name}/index.ts`,
      allowed: true,
    })),
    {
      name: "valid-pair-upward-rejected",
      from: "types",
      target: "utils/index.ts",
      rule: "backend-types-no-upward",
    },
    ...["startup-config", "client-origin-cors", "session-handoff"]
      .filter(
        (name) =>
          !baselineRules || existsSync(join(sourceRoot, `config/${name}.ts`)),
      )
      .map((name) => ({
        name: `utils-config-face-${name}`,
        from: "utils",
        target: `config/${name}.ts`,
        allowed: !baselineRules,
        runtime: true,
        rule: baselineRules ? "backend-config-entry-only" : undefined,
      })),
  ];
}

module.exports = { round11Cases };
