import { defineDmsFrontendBuild } from "#dms/frontend-build";

export default defineDmsFrontendBuild((build) => {
  build.registerAutoImports([
    "layers/*/app/composables",
    "layers/*/app/utils",
    "layers/*/app/types",
  ]);
});
