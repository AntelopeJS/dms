const { existsSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const areaDirectory = join(__dirname, ".dependency-cruiser");
const areas = existsSync(areaDirectory)
  ? readdirSync(areaDirectory)
      .filter((file) => file.endsWith(".cjs"))
      .sort()
      .map((file) => require(join(areaDirectory, file)))
  : [];

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
    includeOnly: "^packages/",
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["require", "node", "default"],
      mainFields: ["main", "types"],
    },
  },
};
