import base from "../../oxfmt.config.mts";

export default {
  ...base,
  ignorePatterns: [
    ...(base.ignorePatterns ?? []),
    // Formatted by Prettier until the front end migrates, and Biome excluded
    // every .vue, so bringing them in is part of that migration.
    "frontend-vue/**",
    "**/*.vue",
    // Written by scripts/docs-catalog.mjs, which `docs:catalog:check` compares
    // byte for byte: a formatter rewriting it would make it stale.
    "docs-data/blocks.json",
  ],
};
