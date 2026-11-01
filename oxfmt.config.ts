import { antelopeFmtPreset } from "@antelopejs/tooling-configs/oxc/fmt";

/** The catalog is generated; Vue files retain their existing Prettier setup. */
export default antelopeFmtPreset({
  ignorePatterns: [
    "**/*.md",
    "packages/dms/frontend-vue/**",
    "**/*.vue",
    "packages/dms/docs-data/blocks.json",
  ],
  sortPackageJson: false,
});
