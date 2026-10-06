import { defineDmsFrontendBuild } from "#dms/frontend-build";

// The public API of each layer: its root composables, utils and types. Its
// build/ directory is private and imported by path.
export default defineDmsFrontendBuild((build) => {
  build.registerAutoImports([
    "layers/*/app/composables",
    "layers/*/app/utils",
    "layers/*/app/types",
  ]);
});
