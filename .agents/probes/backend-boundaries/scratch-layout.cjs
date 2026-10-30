const { cpSync, mkdirSync } = require("node:fs");
const { baselineRules, join, root } = require("./context.cjs");

/**
 * Layout of the scratch copy of the backend. Never introduce fixtures into the
 * live tree: another probe may be scanning it.
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

function copyBackend(layout) {
  mkdirSync(layout.backend, { recursive: true });
  for (const name of ["src", "dist", "scripts", "package.json"])
    cpSync(join(root, "packages/dms", name), join(layout.backend, name), {
      recursive: true,
    });
}

function copyRules(layout) {
  mkdirSync(join(layout.scratch, ".dependency-cruiser"));
  cpSync(
    baselineRules ?? join(root, ".dependency-cruiser/backend.cjs"),
    join(layout.scratch, ".dependency-cruiser/backend.cjs"),
  );
}

module.exports = { copyBackend, copyRules, scratchLayout };
