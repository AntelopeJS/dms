const { cpSync, mkdirSync } = require("node:fs");
const { baselineRules, join, root } = require("./context.cjs");

/**
 * @typedef {{
 *   scratch: string;
 *   ts: ReturnType<typeof import("./context.cjs").loadTypescript>;
 *   backend: string;
 *   sourceRoot: string;
 *   distRoot: string;
 *   hook: string;
 * }} Layout
 */

/**
 * Layout of the scratch copy of the backend. Never introduce fixtures into the
 * live tree: another probe may be scanning it.
 * @param {string} scratch
 * @param {Layout["ts"]} ts
 * @returns {Layout}
 */
function scratchLayout(scratch, ts) {
  const backend = join(scratch, "packages/dms");
  return {
    scratch,
    ts,
    backend,
    sourceRoot: join(backend, "src"),
    distRoot: join(backend, "dist"),
    hook: join(backend, "scripts/backend-runtime-boundaries.cjs"),
  };
}

/**
 * @param {Layout} layout
 */
function copyBackend(layout) {
  mkdirSync(layout.backend, { recursive: true });
  for (const name of ["src", "dist", "scripts", "package.json"])
    cpSync(join(root, "packages/dms", name), join(layout.backend, name), {
      recursive: true,
    });
}

/**
 * @param {Layout} layout
 */
function copyRules(layout) {
  mkdirSync(join(layout.scratch, ".dependency-cruiser"));
  cpSync(
    baselineRules ?? join(root, ".dependency-cruiser/backend.cjs"),
    join(layout.scratch, ".dependency-cruiser/backend.cjs"),
  );
}

module.exports = { copyBackend, copyRules, scratchLayout };
