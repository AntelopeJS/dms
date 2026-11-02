/**
 * @typedef {{ path?: string | string[], pathNot?: string | string[] }} Selector
 * One side of a rule: the paths it selects and the paths it leaves out.
 */

/**
 * @typedef {{
 *   name: string,
 *   severity: string,
 *   from: Selector,
 *   to: Selector & { couldNotResolve?: boolean, dependencyTypesNot?: string[] },
 * }} ForbiddenRule
 * A forbidden dependency between two sets of modules.
 */

/**
 * @typedef {{ forbidden: ForbiddenRule[] }} Area
 * What an area file under `.dependency-cruiser/` contributes.
 */

/**
 * @typedef {{
 *   forbidden: ForbiddenRule[],
 *   options: {
 *     doNotFollow: { path: string },
 *     exclude: { path: string },
 *     includeOnly: string,
 *     tsPreCompilationDeps: boolean,
 *     tsConfig: { fileName: string },
 *     enhancedResolveOptions: {
 *       exportsFields: string[],
 *       conditionNames: string[],
 *       mainFields: string[],
 *     },
 *   },
 * }} Config
 * The dependency-cruiser configuration this repository loads.
 */

const areas = [
  require("./.dependency-cruiser/backend.cjs"),
  require("./.dependency-cruiser/frontend.cjs"),
  require("./.dependency-cruiser/interface-dms.cjs"),
  require("./.dependency-cruiser/playground.cjs"),
];

/** @type {Config} */
module.exports = {
  forbidden: [
    {
      name: "no-unresolved",
      severity: "error",
      from: {},
      to: { couldNotResolve: true, dependencyTypesNot: ["type-only"] },
    },
    ...areas.flatMap((area) => area.forbidden),
  ],
  options: {
    doNotFollow: { path: "(?:^|/)(?:node_modules|dist)/" },
    exclude: { path: "(?:^|/)(?:node_modules|\\.nuxt|\\.output)/" },
    includeOnly: "^(?:packages/|#dms-)",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: ".dependency-cruiser.tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["require", "node", "default"],
      mainFields: ["main", "types"],
    },
  },
};
