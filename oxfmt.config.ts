import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

/** The catalog and the mockup schema are generated; Vue files retain their existing Prettier setup. */
export default antelopeFmtPreset({
  ignorePatterns: [
    "**/*.md",
    "packages/dms/frontend-vue/**",
    "**/*.vue",
    "packages/dms/docs-data/blocks.json",
    "packages/dms/data/mockup-spec.schema.json",
  ],
  sortPackageJson: false,
});
