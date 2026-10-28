import { defineDmsFrontendBuild } from "#dms/frontend-build";
import { backendBoundary } from "./build/backend-boundary.ts";

export default defineDmsFrontendBuild((build) => {
  build.registerAutoImports([
    "layers/*/app/composables",
    "layers/*/app/utils",
    "layers/*/app/types",
  ]);
  build.registerVitePlugins(() => [backendBoundary()]);
});
